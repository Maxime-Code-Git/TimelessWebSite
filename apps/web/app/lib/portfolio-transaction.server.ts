import { getPortfolioContent, trashPhoto, getPortfolioMediaPath, assertPortfolioRevision, savePortfolio } from "./portfolio-content.server";
import { trashPhotoMedia, restorePhotoMedia, regenerateImageVariants, SafeImageError } from "./portfolio-image.server";
import { RevisionConflictError, CorruptedContentError } from "./site-content.server";
import * as fs from "node:fs";

export class TransactionRollbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionRollbackError";
  }
}

export function deletePhotoTransactionally(photoId: string, revision: string, renameSyncFn = fs.renameSync): { newRevision: string } {
  // 0. Vérifier la révision avant toute mutation
  assertPortfolioRevision(revision);

  const portfolio = getPortfolioContent();
  const photo = portfolio.photos.find(p => p.id === photoId);
  if (!photo) {
    throw new Error("Photo not found");
  }

  // 1. Déplacer les médias (si ça échoue, une erreur est throw et le JSON n'est pas touché)
  trashPhotoMedia(photoId, getPortfolioMediaPath(), photo, renameSyncFn);

  // 2. Muter le JSON
  try {
    const result = trashPhoto(photoId, revision);
    return { newRevision: result.newRevision };
  } catch (error: unknown) {
    // 3. Rollback
    try {
      restorePhotoMedia(photoId, getPortfolioMediaPath(), photo);
    } catch (rollbackError: unknown) {
      console.error("Rollback failed for photo:", photoId, "Error type:", typeof rollbackError);
      throw new TransactionRollbackError("Operation failed and rollback was incomplete.");
    }
    throw error; // Re-throw the original JSON save error (e.g., RevisionConflictError)
  }
}

export interface RegeneratePhotoWatermarkResult {
  photoId: string;
  alreadyUpToDate: boolean;
  newPortfolioRevision: string;
  appliedWatermarkRevision: string;
}

export async function regeneratePhotoWatermark(
  photoId: string,
  expectedPortfolioRevision: string,
  options?: {
    mediaBasePath?: string;
    renameSyncFn?: typeof fs.renameSync;
    onBeforeSavePortfolio?: () => void;
  }
): Promise<RegeneratePhotoWatermarkResult> {
  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photoId)) {
    throw new SafeImageError("Invalid photo ID.");
  }

  const mediaBasePath = options?.mediaBasePath || getPortfolioMediaPath();

  // 1. Assert revision conflict before doing anything
  assertPortfolioRevision(expectedPortfolioRevision);

  const portfolio = getPortfolioContent();
  const photoIndex = portfolio.photos.findIndex(p => p.id === photoId);
  if (photoIndex === -1) {
    throw new SafeImageError("Photo introuvable.");
  }

  const photo = portfolio.photos[photoIndex];

  // 2. Idempotency check: if already at current watermark revision, skip!
  if (photo.appliedWatermarkRevision === portfolio.watermark.revision) {
    return {
      photoId,
      alreadyUpToDate: true,
      newPortfolioRevision: portfolio.revision,
      appliedWatermarkRevision: photo.appliedWatermarkRevision,
    };
  }

  // 3. Regenerate variants from original file
  const { variants: newVariants, commit, rollback } = await regenerateImageVariants(
    photoId,
    mediaBasePath,
    photo,
    portfolio.watermark.text,
    portfolio.watermark.revision,
    { renameSyncFn: options?.renameSyncFn }
  );

  // 4. Update JSON transactionally
  try {
    if (options?.onBeforeSavePortfolio) {
      options.onBeforeSavePortfolio();
    }

    portfolio.photos[photoIndex] = {
      ...photo,
      variants: newVariants,
      appliedWatermarkRevision: portfolio.watermark.revision,
      processedAt: new Date().toISOString(),
    };

    const newRevision = savePortfolio(portfolio, expectedPortfolioRevision);

    // Commit filesystem changes
    commit();

    return {
      photoId,
      alreadyUpToDate: false,
      newPortfolioRevision: newRevision,
      appliedWatermarkRevision: portfolio.watermark.revision,
    };
  } catch (err) {
    // Rollback filesystem changes
    try {
      rollback();
    } catch {
      // rollback is best effort
    }

    if (err instanceof RevisionConflictError || err instanceof CorruptedContentError) {
      throw err;
    }
    if (err instanceof SafeImageError) {
      throw err;
    }
    throw new SafeImageError("Image processing failed due to an internal error.");
  }
}

export interface RegenerateNextResult {
  success: boolean;
  done: boolean;
  processedPhotoId?: string;
  totalPhotos: number;
  upToDatePhotos: number;
  outdatedPhotos: number;
  portfolioRevision: string;
}

export async function regenerateNextOutdatedPhoto(
  expectedPortfolioRevision: string,
  options?: {
    photoId?: string;
    mediaBasePath?: string;
    renameSyncFn?: typeof fs.renameSync;
    onBeforeSavePortfolio?: () => void;
  }
): Promise<RegenerateNextResult> {
  assertPortfolioRevision(expectedPortfolioRevision);
  const portfolio = getPortfolioContent();
  const currentWatermarkRev = portfolio.watermark.revision;

  const outdated = portfolio.photos.filter(p => p.appliedWatermarkRevision !== currentWatermarkRev);
  const totalPhotos = portfolio.photos.length;
  const upToDatePhotos = totalPhotos - outdated.length;

  if (outdated.length === 0) {
    return {
      success: true,
      done: true,
      totalPhotos,
      upToDatePhotos,
      outdatedPhotos: 0,
      portfolioRevision: portfolio.revision,
    };
  }

  const targetPhoto = options?.photoId
    ? outdated.find(p => p.id === options.photoId)
    : outdated[0];

  if (!targetPhoto) {
    return {
      success: true,
      done: outdated.length === 0,
      totalPhotos,
      upToDatePhotos,
      outdatedPhotos: outdated.length,
      portfolioRevision: portfolio.revision,
    };
  }

  const result = await regeneratePhotoWatermark(targetPhoto.id, expectedPortfolioRevision, options);

  const updatedPortfolio = getPortfolioContent();
  const remainingOutdated = updatedPortfolio.photos.filter(p => p.appliedWatermarkRevision !== currentWatermarkRev).length;

  return {
    success: true,
    done: remainingOutdated === 0,
    processedPhotoId: result.photoId,
    totalPhotos: updatedPortfolio.photos.length,
    upToDatePhotos: updatedPortfolio.photos.length - remainingOutdated,
    outdatedPhotos: remainingOutdated,
    portfolioRevision: result.newPortfolioRevision,
  };
}
