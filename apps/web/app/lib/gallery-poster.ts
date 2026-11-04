import type { Metadata } from "sharp";

export const MAX_POSTER_PIXELS = 120_000_000;
export const MAX_POSTER_DIMENSION = 20_000;
export const MAX_POSTER_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
export const MAX_POSTER_PAYLOAD_SIZE = MAX_POSTER_FILE_SIZE + 1024 * 1024; // 51 MB

export const ALLOWED_POSTER_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export const ALLOWED_POSTER_FORMATS = new Set([
  "jpeg",
  "png",
  "webp",
  "avif",
]);

export function validatePosterMetadata(metadata: Metadata): { valid: true } | { valid: false; message: string; status: number } {
  if (!metadata.format || !ALLOWED_POSTER_FORMATS.has(metadata.format)) {
    return { valid: false, message: "Format d'image non supporté (JPEG, PNG, WebP, AVIF requis).", status: 415 };
  }

  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (width > MAX_POSTER_DIMENSION || height > MAX_POSTER_DIMENSION) {
    return {
      valid: false,
      message: `Une dimension dépasse la limite de ${MAX_POSTER_DIMENSION.toLocaleString("fr-FR")} pixels (${width} × ${height}).`,
      status: 413,
    };
  }

  const totalPixels = width * height;
  if (totalPixels > MAX_POSTER_PIXELS) {
    return {
      valid: false,
      message: `L'image dépasse la limite de ${(MAX_POSTER_PIXELS / 1_000_000).toLocaleString("fr-FR")} millions de pixels (${totalPixels.toLocaleString("fr-FR")} pixels).`,
      status: 413,
    };
  }

  return { valid: true };
}
