import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MiB
const MAX_PIXELS = 80_000_000;
const MAX_DIMENSION = 12000;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const WEBP_QUALITY = 80;

const VARIANT_BREAKPOINTS = [
  { name: "480p" as const, maxWidth: 480 },
  { name: "960p" as const, maxWidth: 960 },
  { name: "1440p" as const, maxWidth: 1440 },
  { name: "1920p" as const, maxWidth: 1920 },
] as const;

export type VariantName = (typeof VARIANT_BREAKPOINTS)[number]["name"];

export interface VariantResult {
  name: VariantName;
  width: number;
  height: number;
  sizeBytes: number;
  fileId: string;
}

export interface ImageProcessingResult {
  originalFormat: string;
  originalWidth: number;
  originalHeight: number;
  fileId: string;
  variants: VariantResult[];
  appliedWatermarkRevision: string;
}

function resolveFontPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Try multiple resolution strategies for the font file
  const fontRelativePath = "References/fonts/cormorant-garamond/CormorantGaramond-SemiBold.ttf";

  // Strategy 1: From the monorepo root relative to this file's location
  // In source: apps/web/app/lib/portfolio-image.server.ts -> 4 levels up
  const fromSource = path.resolve(__dirname, "../../../../", fontRelativePath);
  if (fs.existsSync(fromSource)) return fromSource;

  // Strategy 2: After build, the server bundle is at apps/web/build/server/index.js
  // so __dirname would be apps/web/build/server -> 4 levels up to monorepo root
  const fromBuild = path.resolve(__dirname, "../../../..", fontRelativePath);
  if (fs.existsSync(fromBuild)) return fromBuild;

  // Strategy 3: Walk up from __dirname looking for References/fonts
  let current = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(current, fontRelativePath);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error("Required font file is not available.");
}

let cachedFontPath: string | null = null;

function getFontPath(): string {
  if (cachedFontPath && fs.existsSync(cachedFontPath)) return cachedFontPath;
  cachedFontPath = resolveFontPath();
  return cachedFontPath;
}

/** Reset cached font path — for testing only */
export function _resetFontCache(): void {
  cachedFontPath = null;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface WatermarkRenderOptions {
  text: string;
  watermarkRevision: string;
  width: number;
  height: number;
}

export async function renderTextWatermark(options: WatermarkRenderOptions): Promise<Buffer> {
  const { text, width, height } = options;
  const fontPath = getFontPath();
  const fontData = fs.readFileSync(fontPath);
  const fontBase64 = fontData.toString("base64");

  const escapedText = escapeXml(text);

  // Target ~50% width, scale font size proportionally
  const targetWidth = Math.round(width * 0.5);
  // Estimate font size based on target width and text length
  // Cormorant Garamond at ~0.55 width-per-height ratio
  const estimatedCharWidth = 0.55;
  let fontSize = Math.round(targetWidth / (text.length * estimatedCharWidth));
  fontSize = Math.max(12, Math.min(fontSize, Math.round(height * 0.15)));

  const shadowOffset = Math.max(1, Math.round(fontSize * 0.03));

  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <style type="text/css">
      @font-face {
        font-family: 'CormorantWatermark';
        src: url('data:font/truetype;base64,${fontBase64}');
      }
    </style>
  </defs>
  <text
    x="50%" y="50%"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="CormorantWatermark"
    font-weight="600"
    font-size="${fontSize}px"
    fill="rgba(0,0,0,0.25)"
    dx="${shadowOffset}" dy="${shadowOffset}"
  >${escapedText}</text>
  <text
    x="50%" y="50%"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="CormorantWatermark"
    font-weight="600"
    font-size="${fontSize}px"
    fill="rgba(255,255,255,0.45)"
  >${escapedText}</text>
</svg>`;

  return Buffer.from(svgText);
}

function validateConfinement(filePath: string, allowedDir: string): void {
  const resolvedAllowed = path.resolve(allowedDir);
  const resolvedFile = path.resolve(filePath);

  const rel = path.relative(resolvedAllowed, resolvedFile);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Image validation failed.");
  }

  if (fs.existsSync(resolvedFile)) {
    const realFilePath = fs.realpathSync(resolvedFile);
    let realAllowedDir: string;
    try {
      realAllowedDir = fs.realpathSync(resolvedAllowed);
    } catch {
      throw new Error("Image validation failed.");
    }
    const realRel = path.relative(realAllowedDir, realFilePath);
    if (realRel.startsWith("..") || path.isAbsolute(realRel)) {
      throw new Error("Image validation failed.");
    }
  }
}

export async function validateImageFile(
  filePath: string,
  allowedDir: string
): Promise<{ format: string; width: number; height: number }> {
  try {
    // 1. Confinement check
    validateConfinement(filePath, allowedDir);

    // 2. Size check
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      throw new Error("Image file exceeds the maximum allowed size.");
    }

    // 3. Magic bytes check (read first 4100 bytes)
    const headerBuffer = Buffer.alloc(4100);
    const fd = fs.openSync(filePath, "r");
    try {
      fs.readSync(fd, headerBuffer, 0, 4100, 0);
    } finally {
      fs.closeSync(fd);
    }

    const uint8View = new Uint8Array(headerBuffer.buffer, headerBuffer.byteOffset, headerBuffer.byteLength);
    const fileTypeResult = await fileTypeFromBuffer(uint8View);
    if (!fileTypeResult || !ALLOWED_MIME_TYPES.has(fileTypeResult.mime)) {
      throw new Error("Unsupported image format.");
    }

    // 4. Sharp metadata check
    const metadata = await sharp(filePath, { limitInputPixels: MAX_PIXELS }).metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (!width || !height) {
      throw new Error("Could not determine image dimensions.");
    }

    // Check for animated/multi-page images
    if (metadata.pages && metadata.pages > 1) {
      throw new Error("Animated or multi-page images are not supported.");
    }

    // Apply orientation to get actual dimensions
    let orientedWidth = width;
    let orientedHeight = height;
    if (metadata.orientation && metadata.orientation >= 5) {
      orientedWidth = height;
      orientedHeight = width;
    }

    // Numeric overflow protection (JS Number is safe up to 9 quadrillion, but to be safe)
    if (!Number.isSafeInteger(orientedWidth) || !Number.isSafeInteger(orientedHeight)) {
      throw new Error("Invalid image dimensions.");
    }

    const totalPixels = orientedWidth * orientedHeight;
    if (totalPixels > MAX_PIXELS) {
      throw new Error("Image resolution exceeds the maximum allowed pixels.");
    }

    if (orientedWidth > MAX_DIMENSION || orientedHeight > MAX_DIMENSION) {
      throw new Error("Image dimensions exceed the maximum allowed size.");
    }

    return {
      format: fileTypeResult.ext,
      width: orientedWidth,
      height: orientedHeight,
    };
  } catch (err) {
    if (err instanceof Error && (
      err.message.startsWith("Image") ||
      err.message.startsWith("Unsupported") ||
      err.message.startsWith("Animated") ||
      err.message.startsWith("Could not") ||
      err.message.startsWith("Invalid")
    )) {
      throw err;
    }
    // Mask all other errors (system errors, ENOENT, EACCES, etc.)
    // eslint-disable-next-line preserve-caught-error
    throw new Error("Image processing failed due to an internal error.");
  }
}

function ensureStrictDirectory(dirPath: string, basePath: string, allowMissing: boolean = true): void {
  try {
    const stat = fs.lstatSync(dirPath);
    if (stat.isSymbolicLink()) {
      throw new Error("Directory is a symlink");
    }
    if (!stat.isDirectory()) {
      throw new Error("Not a directory");
    }

    // Canonical resolution check
    const realBase = fs.realpathSync(basePath);
    const realDir = fs.realpathSync(dirPath);
    const rel = path.relative(realBase, realDir);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error("Outside base path");
    }
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT" && allowMissing) {
      // Missing is fine for creation when allowed
      return;
    }
    // eslint-disable-next-line preserve-caught-error
    throw new Error("Image processing failed due to an internal error.");
  }
}

function ensureStrictDirectoryCreated(dirPath: string, basePath: string): void {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
    } catch (err: unknown) {
      // Ignore EEXIST in case of race conditions
      if (!(err instanceof Error) || (err as NodeJS.ErrnoException).code !== "EEXIST") {
        // eslint-disable-next-line preserve-caught-error
        throw new Error("Image processing failed due to an internal error.");
      }
    }
  }

  // Re-verify after creation
  try {
    const stat = fs.lstatSync(dirPath);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error("Invalid directory");
    }
    const realBase = fs.realpathSync(basePath);
    const realDir = fs.realpathSync(dirPath);
    const rel = path.relative(realBase, realDir);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error("Outside base path");
    }
  } catch {
    throw new Error("Image processing failed due to an internal error.");
  }
}

function generateFileId(): string {
  return crypto.randomBytes(16).toString("hex");
}

function atomicWriteFile(targetPath: string, content: Buffer, mode: number): void {
  const dir = path.dirname(targetPath);
  const tmpName = path.join(dir, `.tmp.${crypto.randomBytes(8).toString("hex")}`);
  let fd: number | null = null;
  let dirFd: number | null = null;

  try {
    fd = fs.openSync(tmpName, "wx", mode);
    let bytesWritten = 0;
    while (bytesWritten < content.length) {
      const written = fs.writeSync(fd, content, bytesWritten, content.length - bytesWritten, bytesWritten);
      if (written <= 0) throw new Error("Write failed.");
      bytesWritten += written;
    }
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    fs.renameSync(tmpName, targetPath);

    try {
      dirFd = fs.openSync(dir, "r");
      fs.fsyncSync(dirFd);
    } catch {
      // best-effort
    }
  } catch (err) {
    if (fs.existsSync(tmpName)) {
      try { fs.unlinkSync(tmpName); } catch { /* ignore */ }
    }
    throw err;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
    if (dirFd !== null) {
      try { fs.closeSync(dirFd); } catch { /* ignore */ }
    }
  }
}

export async function processImage(
  tempFilePath: string,
  allowedTempDir: string,
  projectId: string,
  mediaBasePath: string,
  watermarkText: string,
  watermarkRevision: string
): Promise<ImageProcessingResult> {
  // Validate UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error("Invalid project ID.");
  }

  const { format, width, height } = await validateImageFile(tempFilePath, allowedTempDir);

  const fileId = generateFileId();
  const createdFiles: string[] = [];
  const createdDirs: string[] = [];

  try {
    const resolvedMediaBasePath = path.resolve(mediaBasePath);
    ensureStrictDirectory(resolvedMediaBasePath, resolvedMediaBasePath, false);

    const projectDir = path.resolve(resolvedMediaBasePath, projectId);
    const originalsDir = path.resolve(projectDir, "originals");

    for (const dir of [projectDir, originalsDir]) {
      if (!fs.existsSync(dir)) {
        ensureStrictDirectoryCreated(dir, resolvedMediaBasePath);
        createdDirs.push(dir);
      } else {
        ensureStrictDirectory(dir, resolvedMediaBasePath);
      }
    }

    const originalPath = path.resolve(originalsDir, `${fileId}.${format}`);
    validateConfinement(originalPath, resolvedMediaBasePath);

    // Copy the original exactly as it is, without modification
    const originalBuffer = fs.readFileSync(tempFilePath);
    atomicWriteFile(originalPath, originalBuffer, 0o600);
    createdFiles.push(originalPath);

    const variants: VariantResult[] = [];

    for (const breakpoint of VARIANT_BREAKPOINTS) {
      if (breakpoint.name !== "480p" && width <= breakpoint.maxWidth && height <= breakpoint.maxWidth) {
        continue;
      }

      const variantDir = path.resolve(projectDir, breakpoint.name);

      if (!fs.existsSync(variantDir)) {
        ensureStrictDirectoryCreated(variantDir, resolvedMediaBasePath);
        createdDirs.push(variantDir);
      } else {
        ensureStrictDirectory(variantDir, resolvedMediaBasePath);
      }

      let resizeWidth: number;
      let resizeHeight: number;
      if (width <= breakpoint.maxWidth && height <= breakpoint.maxWidth) {
        resizeWidth = width;
        resizeHeight = height;
      } else {
        const scale = Math.min(breakpoint.maxWidth / width, breakpoint.maxWidth / height);
        resizeWidth = Math.round(width * scale);
        resizeHeight = Math.round(height * scale);
      }

      const watermarkSvg = await renderTextWatermark({
        text: watermarkText,
        watermarkRevision,
        width: resizeWidth,
        height: resizeHeight,
      });

      const variantFileId = `${fileId}-${breakpoint.name}`;
      const variantPath = path.resolve(variantDir, `${variantFileId}.webp`);
      validateConfinement(variantPath, resolvedMediaBasePath);

      const variantBuffer = await sharp(tempFilePath, { limitInputPixels: MAX_PIXELS })
        .rotate() // auto-orientation
        .resize(resizeWidth, resizeHeight, { fit: "inside", withoutEnlargement: true })
        .composite([{ input: watermarkSvg, top: 0, left: 0 }])
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      atomicWriteFile(variantPath, variantBuffer, 0o600);
      createdFiles.push(variantPath);

      const outputMeta = await sharp(variantBuffer).metadata();

      variants.push({
        name: breakpoint.name,
        width: outputMeta.width ?? resizeWidth,
        height: outputMeta.height ?? resizeHeight,
        sizeBytes: variantBuffer.length,
        fileId: variantFileId,
      });
    }

    return {
      originalFormat: format,
      originalWidth: width,
      originalHeight: height,
      fileId,
      variants,
      appliedWatermarkRevision: watermarkRevision,
    };
  } catch (err) {
    for (const file of createdFiles.reverse()) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch { /* ignore */ }
    }
    for (const dir of createdDirs.reverse()) {
      try {
        if (fs.existsSync(dir)) {
          const entries = fs.readdirSync(dir);
          if (entries.length === 0) fs.rmdirSync(dir);
        }
      } catch { /* ignore */ }
    }

    if (err instanceof Error && (
      err.message.startsWith("Image") ||
      err.message.startsWith("Unsupported") ||
      err.message.startsWith("Animated") ||
      err.message.startsWith("Could not") ||
      err.message.startsWith("Invalid") ||
      err.message.startsWith("Required font")
    )) {
      throw err;
    }
        // eslint-disable-next-line preserve-caught-error
    throw new Error("Image processing failed due to an internal error.");
  }
}
