import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { ENV } from './env.server';
import pLimit from 'p-limit';

const ALLOWED_WIDTHS = [480, 960, 1920] as const;
export type AllowedWidth = typeof ALLOWED_WIDTHS[number];

const pendingGenerations = new Map<string, Promise<void>>();
const sharpLimit = pLimit(2);

function isSafePath(base: string, target: string): boolean {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget.startsWith(resolvedBase + path.sep) && !resolvedTarget.includes('\0');
}

function checkSymlink(target: string): void {
  let current = target;
  while (current !== path.parse(current).root) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`Symlinks are not allowed: ${current}`);
    }
    current = path.dirname(current);
  }
}

export function isAllowedWidth(width: number): width is AllowedWidth {
  return (ALLOWED_WIDTHS as readonly number[]).includes(width);
}

export function getPreviewPath(galleryId: string, mediaId: string, width: AllowedWidth): string {
  const previewsDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId, '.previews', mediaId);
  if (!isSafePath(ENV.GALLERY_MEDIA_PATH, previewsDir)) {
    throw new Error('Unsafe preview directory path');
  }
  return path.join(previewsDir, `${width}.webp`);
}

async function generateSinglePreview(
  originalPath: string,
  previewPath: string,
  width: AllowedWidth
): Promise<void> {
  if (fs.existsSync(previewPath)) {
    return;
  }

  const tempPath = `${previewPath}.tmp.${crypto.randomUUID()}`;

  try {
    const dir = path.dirname(previewPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    let quality = 80;
    if (width === 480) quality = 80;
    else if (width === 960) quality = 80;
    else if (width === 1920) quality = 84;

    await sharpLimit(async () => {
      await sharp(originalPath)
        .rotate()
        .resize(width, width, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toFile(tempPath);
    });

    fs.chmodSync(tempPath, 0o600);
    fs.renameSync(tempPath, previewPath);
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore error during cleanup
      }
    }
    throw error;
  }
}

export async function ensurePreview(
  galleryId: string,
  mediaId: string,
  width: AllowedWidth,
  sourcePath?: string
): Promise<boolean> {
  const originalPath = sourcePath || path.join(ENV.GALLERY_MEDIA_PATH, galleryId, mediaId);

  if (!isSafePath(ENV.GALLERY_MEDIA_PATH, originalPath) && !sourcePath) {
    throw new Error('Unsafe original path');
  }
  checkSymlink(originalPath);

  if (!fs.existsSync(originalPath)) {
    throw new Error('Original media not found');
  }

  const previewPath = getPreviewPath(galleryId, mediaId, width);
  checkSymlink(path.dirname(previewPath));

  if (fs.existsSync(previewPath)) {
    return false;
  }

  const generationKey = `${galleryId}/${mediaId}/${width}`;

  let generationPromise = pendingGenerations.get(generationKey);
  if (generationPromise) {
    await generationPromise;
    return false;
  }

  generationPromise = (async () => {
    try {
      await generateSinglePreview(originalPath, previewPath, width);
    } finally {
      pendingGenerations.delete(generationKey);
    }
  })();

  pendingGenerations.set(generationKey, generationPromise);
  await generationPromise;

  return true;
}

export async function generateAllPreviews(galleryId: string, mediaId: string, sourcePath?: string): Promise<{ generated: number; ignored: number }> {
  const results = await Promise.all(
    ALLOWED_WIDTHS.map(width => ensurePreview(galleryId, mediaId, width, sourcePath))
  );
  const generated = results.filter(r => r).length;
  const ignored = results.length - generated;
  return { generated, ignored };
}

export function removePreviews(galleryId: string, mediaId: string): void {
  const previewsDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId, '.previews', mediaId);
  if (isSafePath(ENV.GALLERY_MEDIA_PATH, previewsDir)) {
    if (fs.existsSync(previewsDir)) {
      try {
        fs.rmSync(previewsDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    }
  }
}
