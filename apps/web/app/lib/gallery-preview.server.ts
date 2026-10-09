import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { ENV } from './env.server';

export const ALLOWED_WIDTHS = [480, 960, 1920] as const;
export type AllowedWidth = typeof ALLOWED_WIDTHS[number];

type Task<T> = () => Promise<T>;

export class ConcurrencyLimiter {
  private queue: Array<{ task: Task<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
  private active = 0;

  constructor(private readonly limit: number) {}

  public async run<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task: task as Task<unknown>, resolve: resolve as (v: unknown) => void, reject });
      this.next();
    });
  }

  private next() {
    if (this.active >= this.limit || this.queue.length === 0) return;
    this.active++;
    const { task, resolve, reject } = this.queue.shift()!;
    task().then(resolve, reject).finally(() => {
      this.active--;
      this.next();
    });
  }
}

const pendingGenerations = new Map<string, Promise<void>>();
const sharpLimiter = new ConcurrencyLimiter(2);

function enforceSafePath(base: string, target: string): void {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);

  const rel = path.relative(resolvedBase, resolvedTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel) || resolvedTarget.includes('\0')) {
    throw new Error('Unsafe path: outside allowed root');
  }

  if (fs.existsSync(resolvedBase)) {
    if (fs.lstatSync(resolvedBase).isSymbolicLink()) {
      throw new Error('Symlink restriction: root cannot be a symlink');
    }
  }

  const parts = rel.split(path.sep).filter(Boolean);
  let current = resolvedBase;
  for (const part of parts) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error('Symlink restriction: symlinks not allowed inside root');
    }
  }
}

export function isAllowedWidth(width: number): width is AllowedWidth {
  return (ALLOWED_WIDTHS as readonly number[]).includes(width);
}

export function getPreviewPath(galleryId: string, mediaId: string, width: AllowedWidth): string {
  const previewsDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId, '.previews', mediaId);
  enforceSafePath(ENV.GALLERY_MEDIA_PATH, previewsDir);
  return path.join(previewsDir, `${width}.webp`);
}

export const dependencies = {
  sharp
};

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

    await sharpLimiter.run(async () => {
      await dependencies.sharp(originalPath)
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

  // Both the original path (if not using sourcePath) and sourcePath MUST be inside GALLERY_MEDIA_PATH
  enforceSafePath(ENV.GALLERY_MEDIA_PATH, originalPath);

  if (!fs.existsSync(originalPath)) {
    throw new Error('Original media not found');
  }

  const previewPath = getPreviewPath(galleryId, mediaId, width);
  // enforceSafePath for previewPath is already done inside getPreviewPath


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
  try {
    enforceSafePath(ENV.GALLERY_MEDIA_PATH, previewsDir);
    if (fs.existsSync(previewsDir)) {
      fs.rmSync(previewsDir, { recursive: true, force: true });
    }
  } catch {
    // Ignore error, we just don't remove if it's unsafe or fails
  }
}
