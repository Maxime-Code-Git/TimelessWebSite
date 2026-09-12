import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import sharp from "sharp";
import {
  validateImageFile,
  ensureStrictDirectoryCreated,
  ensureStrictDirectory,
  validateConfinement,
  atomicWriteFile,
  SafeImageError,
  renderTextWatermark
} from "./portfolio-image.server";

export function generateHomeMediaId(): string {
  return crypto.randomUUID();
}

const HOME_VARIANT_BREAKPOINTS = [
  { name: "640p", maxWidth: 640 },
  { name: "960p", maxWidth: 960 },
  { name: "1440p", maxWidth: 1440 },
  { name: "1920p", maxWidth: 1920 },
];

const MAX_PIXELS = 100000000; // 100 MP
const WEBP_QUALITY = 82;
const AVIF_QUALITY = 65;
const AVIF_EFFICIENCY = 4; // speed 4 is a good balance for AVIF

export interface HomeVariantResult {
  name: string;
  width: number;
  height: number;
  sizeBytesWebp: number;
  sizeBytesAvif: number;
  fileId: string; // The base name without extension
}

export interface HomeImageProcessingResult {
  originalFormat: "jpeg" | "png" | "webp";
  originalWidth: number;
  originalHeight: number;
  imageId: string; // The UUID generated for this media
  variants: HomeVariantResult[];
  appliedWatermarkRevision: string;
}

export class MediaRollbackError extends Error {
  constructor() {
    super("Media rollback failed");
    this.name = "MediaRollbackError";
  }
}

export async function processHomeImage(
  tempFilePath: string,
  allowedTempDir: string,
  section: "hero" | "portfolio-photo" | "portfolio-video" | "studio",
  watermarkText: string,
  watermarkRevision: string,
  injectedUnlink: typeof fs.unlinkSync = fs.unlinkSync,
  injectedRmdir: typeof fs.rmdirSync = fs.rmdirSync
): Promise<HomeImageProcessingResult> {
  const { format, width, height } = await validateImageFile(tempFilePath, allowedTempDir);

  const imageId = generateHomeMediaId();
  const createdFiles: string[] = [];
  const createdDirs: string[] = [];

  const mediaBasePath = process.env.SITE_MEDIA_PATH || path.join(process.cwd(), "data", "media", "site");
  const resolvedMediaBasePath = path.resolve(mediaBasePath);

  try {
    ensureStrictDirectoryCreated(resolvedMediaBasePath, path.resolve(resolvedMediaBasePath, ".."));

    const homeDir = path.resolve(resolvedMediaBasePath, "home");
    const sectionDir = path.resolve(homeDir, section);
    const projectDir = path.resolve(sectionDir, imageId); // Subdirectory per image

    for (const dir of [homeDir, sectionDir, projectDir]) {
      if (!fs.existsSync(dir)) {
        ensureStrictDirectoryCreated(dir, resolvedMediaBasePath);
        createdDirs.push(dir);
      } else {
        ensureStrictDirectory(dir, resolvedMediaBasePath);
      }
    }

    const variants: HomeVariantResult[] = [];

    for (const breakpoint of HOME_VARIANT_BREAKPOINTS) {
      if (width <= breakpoint.maxWidth && height <= breakpoint.maxWidth) {
        // Skip larger variants if the original is smaller
        // But always create at least the first variant to have a fallback
        if (variants.length > 0) {
          continue;
        }
      }

      const variantDir = path.resolve(projectDir, breakpoint.name);

      if (!fs.existsSync(variantDir)) {
        ensureStrictDirectoryCreated(variantDir, resolvedMediaBasePath);
        createdDirs.push(variantDir);
      } else {
        ensureStrictDirectory(variantDir, resolvedMediaBasePath);
      }

      const variantFileId = `${imageId}-${breakpoint.name}`;

      const webpPath = path.resolve(variantDir, `${variantFileId}.webp`);
      const avifPath = path.resolve(variantDir, `${variantFileId}.avif`);
      validateConfinement(webpPath, resolvedMediaBasePath);
      validateConfinement(avifPath, resolvedMediaBasePath);

      const { data: rawBuffer, info } = await sharp(tempFilePath, { limitInputPixels: MAX_PIXELS })
        .rotate() // auto-orientation
        .resize(breakpoint.maxWidth, breakpoint.maxWidth, { fit: "inside", withoutEnlargement: true })
        .toColorspace("srgb")
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const watermarkSvg = await renderTextWatermark({
        text: watermarkText,
        watermarkRevision,
        width: info.width,
        height: info.height,
      });

      const watermarkedImg = sharp(rawBuffer, {
        raw: { width: info.width, height: info.height, channels: 4 }
      }).composite([{ input: watermarkSvg, top: 0, left: 0 }]);

      const webpBuffer = await watermarkedImg
        .clone()
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      const avifBuffer = await watermarkedImg
        .clone()
        .avif({ quality: AVIF_QUALITY, effort: AVIF_EFFICIENCY })
        .toBuffer();

      atomicWriteFile(webpPath, webpBuffer, 0o600);
      createdFiles.push(webpPath);

      atomicWriteFile(avifPath, avifBuffer, 0o600);
      createdFiles.push(avifPath);

      variants.push({
        name: breakpoint.name,
        width: info.width,
        height: info.height,
        sizeBytesWebp: webpBuffer.length,
        sizeBytesAvif: avifBuffer.length,
        fileId: variantFileId,
      });
    }

    return {
      originalFormat: format,
      originalWidth: width,
      originalHeight: height,
      imageId,
      variants,
      appliedWatermarkRevision: watermarkRevision,
    };
  } catch (e) {
    let rollbackFailed = false;
    for (const file of createdFiles.reverse()) {
      try { injectedUnlink(file); } catch { rollbackFailed = true; }
    }
    for (const dir of createdDirs.reverse()) {
      try { injectedRmdir(dir); } catch { rollbackFailed = true; }
    }
    if (rollbackFailed) {
      throw new MediaRollbackError();
    }
    if (e instanceof SafeImageError) {
      throw e;
    }
    throw new SafeImageError("Failed to process home image.");
  }
}

export class MediaTransactionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MediaTransactionError";
  }
}

export interface HomeMediaTransaction {
  commit: (injectedRmSync?: typeof fs.rmSync) => void;
  rollback: (injectedRenameSync?: typeof fs.renameSync, injectedRmSync?: typeof fs.rmSync) => void;
  hasQuarantine: boolean;
}

export function prepareHomeImageDeletion(
  section: string,
  imageId: string,
  injectedRenameSync: typeof fs.renameSync = fs.renameSync,
  injectedLstatSync: typeof fs.lstatSync = fs.lstatSync,
  _injectedRmSync: typeof fs.rmSync = fs.rmSync,
  injectedExistsSync: typeof fs.existsSync = fs.existsSync
): HomeMediaTransaction {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(imageId)) {
    return { commit: () => {}, rollback: () => {}, hasQuarantine: false };
  }

  if (!["hero", "portfolio-photo", "portfolio-video", "studio"].includes(section)) {
    return { commit: () => {}, rollback: () => {}, hasQuarantine: false };
  }

  const mediaBasePath = process.env.SITE_MEDIA_PATH || path.join(process.cwd(), "data", "media", "site");
  const resolvedMediaBasePath = path.resolve(mediaBasePath);
  const homeDir = path.resolve(resolvedMediaBasePath, "home");
  const projectDir = path.resolve(homeDir, section, imageId);
  const trashDir = path.resolve(homeDir, ".trash");

  validateConfinement(projectDir, resolvedMediaBasePath);
  validateConfinement(trashDir, resolvedMediaBasePath);

  if (!injectedExistsSync(projectDir)) {
    return { commit: () => {}, rollback: () => {}, hasQuarantine: false };
  }

  const stat = injectedLstatSync(projectDir);
  if (stat.isSymbolicLink()) {
    throw new SafeImageError("Symlinks not allowed in media directory");
  }

  if (!injectedExistsSync(trashDir)) {
    ensureStrictDirectoryCreated(trashDir, resolvedMediaBasePath);
  }

  const quarantinePath = path.resolve(trashDir, `${section}-${imageId}-${crypto.randomUUID()}`);
  if (injectedExistsSync(quarantinePath)) {
    throw new MediaTransactionError("Quarantine path collision");
  }

  injectedRenameSync(projectDir, quarantinePath);

  return {
    hasQuarantine: true,
    commit: (rmSync = fs.rmSync) => {
      try {
        rmSync(quarantinePath, { recursive: true, force: true });
      } catch (e) {
        console.warn("Non-critical cleanup failure in .trash directory.", e);
      }
    },
    rollback: (renameSync = fs.renameSync, rmSync = fs.rmSync) => {
      try {
        if (injectedExistsSync(projectDir)) {
          rmSync(projectDir, { recursive: true, force: true });
        }
        renameSync(quarantinePath, projectDir);
      } catch (e) {
        throw new MediaTransactionError(`Rollback failed for ${section}/${imageId}`, { cause: e });
      }
    }
  };
}
