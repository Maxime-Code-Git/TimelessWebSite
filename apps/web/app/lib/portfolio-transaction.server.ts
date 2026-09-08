import { getPortfolioContent, trashPhoto, getPortfolioMediaPath, assertPortfolioRevision } from "./portfolio-content.server";
import { trashPhotoMedia, restorePhotoMedia } from "./portfolio-image.server";

export class TransactionRollbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionRollbackError";
  }
}

import * as fs from "node:fs";

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
