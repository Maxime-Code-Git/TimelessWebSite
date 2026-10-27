import * as fs from "node:fs";
import * as path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { ensureGalleryImportFolder } from "./gallery-folder.server";

export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk (Cloudflare & memory friendly)
export const SAFETY_BUFFER_BYTES = 50 * 1024 * 1024; // 50 MB safety margin

export const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
export const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm"]);

export class DiskSpaceError extends Error {
  readonly status = 507;
  constructor(message = "Espace disque insuffisant sur le serveur.") {
    super(message);
    this.name = "DiskSpaceError";
  }
}

export class UploadValidationError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "UploadValidationError";
    this.status = status;
  }
}

export const diskChecker = {
  statfs: (targetPath: string) => fs.statfsSync(targetPath),
};

/**
 * Checks available disk space on the filesystem of targetPath.
 */
export function checkDiskSpace(targetPath: string, requiredBytes: number): void {
  try {
    const stats = diskChecker.statfs(targetPath);
    const freeBytes = stats.bavail * stats.bsize;
    if (freeBytes < requiredBytes + SAFETY_BUFFER_BYTES) {
      throw new DiskSpaceError();
    }
  } catch (err) {
    if (err instanceof DiskSpaceError) throw err;
    // If statfs is unsupported or fails, log and proceed with caution
    console.warn("Could not check disk space:", err);
  }
}

/**
 * Strips path separators, null bytes, and traversal patterns from filenames.
 */
export function sanitizeUploadFileName(rawName: string): string {
  if (!rawName || typeof rawName !== "string") return "fichier";
  const base = path.basename(rawName).trim();
  const clean = base
    .replace(/[\0\r\n\t\\/]/g, "")
    .replace(/\.\.+/g, ".")
    .replace(/^[.-]+/, "");
  return clean.slice(0, 200) || "fichier";
}

/**
 * Magic bytes MIME type detector (reused from gallery-import.server.ts).
 */
export function detectMimeType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return "video/webm";
  if (buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    if (["avif", "avis", "mif1", "miaf"].includes(brand)) return "image/avif";
    if (brand.startsWith("iso") || brand.startsWith("mp4") || brand === "avc1") return "video/mp4";
  }
  return null;
}

export interface UploadMetadata {
  uploadId: string;
  galleryId: string;
  target: "photos" | "videos";
  fileName: string;
  fileSize: number;
  totalChunks: number;
  chunkSize: number;
  uploadedChunks: number[];
  createdAt: number;
}

function getUploadsBaseDir(galleryFolderPath: string): string {
  const dir = path.join(galleryFolderPath, ".tmp_uploads");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

/**
 * Cleans up temporary upload folders older than maxAgeMs (default 24h).
 */
export function cleanupAbandonedUploads(galleryFolderPath: string, maxAgeMs = 24 * 60 * 60 * 1000): void {
  try {
    const baseDir = path.join(galleryFolderPath, ".tmp_uploads");
    if (!fs.existsSync(baseDir)) return;
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const now = Date.now();
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const uploadDir = path.join(baseDir, entry.name);
        const metaPath = path.join(uploadDir, "meta.json");
        let shouldRemove = false;
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as UploadMetadata;
            if (now - meta.createdAt > maxAgeMs) shouldRemove = true;
          } catch {
            shouldRemove = true;
          }
        } else {
          const stat = fs.statSync(uploadDir);
          if (now - stat.mtimeMs > maxAgeMs) shouldRemove = true;
        }
        if (shouldRemove) {
          fs.rmSync(uploadDir, { recursive: true, force: true });
        }
      }
    }
  } catch (err) {
    console.warn("Error cleaning up abandoned uploads:", err);
  }
}

/**
 * Initializes a new chunked upload session.
 */
export function initUploadSession(
  galleryId: string,
  params: {
    target: "photos" | "videos";
    fileName: string;
    fileSize: number;
    totalChunks: number;
    chunkSize?: number;
  }
): { uploadId: string; chunkSize: number; totalChunks: number; uploadedChunks: number[] } {
  if (params.target !== "photos" && params.target !== "videos") {
    throw new UploadValidationError("Cible d'import invalide (photos ou videos requis).");
  }

  const cleanName = sanitizeUploadFileName(params.fileName);
  if (!cleanName || cleanName === "fichier") {
    throw new UploadValidationError("Nom de fichier invalide.");
  }

  if (typeof params.fileSize !== "number" || params.fileSize <= 0 || params.fileSize > MAX_FILE_SIZE) {
    throw new UploadValidationError(`Taille de fichier invalide (maximum ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} Mo).`);
  }

  const chunkSize = params.chunkSize && params.chunkSize > 0 && params.chunkSize <= 50 * 1024 * 1024
    ? params.chunkSize
    : DEFAULT_CHUNK_SIZE;

  const calculatedTotalChunks = Math.ceil(params.fileSize / chunkSize);
  if (params.totalChunks !== calculatedTotalChunks) {
    throw new UploadValidationError(`Nombre de morceaux incohérent (attendu ${calculatedTotalChunks}, reçu ${params.totalChunks}).`);
  }

  const folder = ensureGalleryImportFolder(galleryId);
  checkDiskSpace(folder.folderPath, params.fileSize);
  cleanupAbandonedUploads(folder.folderPath);

  const uploadId = crypto.randomUUID();
  const baseDir = getUploadsBaseDir(folder.folderPath);
  const uploadDir = path.join(baseDir, uploadId);

  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });

  const metadata: UploadMetadata = {
    uploadId,
    galleryId,
    target: params.target,
    fileName: cleanName,
    fileSize: params.fileSize,
    totalChunks: calculatedTotalChunks,
    chunkSize,
    uploadedChunks: [],
    createdAt: Date.now(),
  };

  const metaPath = path.join(uploadDir, "meta.json");
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });

  return {
    uploadId,
    chunkSize,
    totalChunks: calculatedTotalChunks,
    uploadedChunks: [],
  };
}

/**
 * Saves an uploaded chunk directly to disk via stream.
 */
export async function saveChunkStream(
  galleryId: string,
  uploadId: string,
  chunkIndex: number,
  chunkStream: NodeJS.ReadableStream | ReadableStream<Uint8Array>
): Promise<{ success: boolean; chunkIndex: number; totalUploaded: number }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId)) {
    throw new UploadValidationError("Identifiant d'upload invalide.");
  }

  const folder = ensureGalleryImportFolder(galleryId);
  const uploadDir = path.join(getUploadsBaseDir(folder.folderPath), uploadId);

  const metaPath = path.join(uploadDir, "meta.json");
  if (!fs.existsSync(metaPath)) {
    throw new UploadValidationError("Session d'upload introuvable ou expirée.", 404);
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as UploadMetadata;

  if (chunkIndex < 0 || chunkIndex >= meta.totalChunks) {
    throw new UploadValidationError("Index de morceau hors limites.");
  }

  checkDiskSpace(folder.folderPath, meta.chunkSize);

  const chunkPartPath = path.join(uploadDir, `chunk_${chunkIndex}.part`);
  const chunkFinalPath = path.join(uploadDir, `chunk_${chunkIndex}`);

  const nodeStream = "pipe" in chunkStream
    ? (chunkStream as NodeJS.ReadableStream)
    : Readable.fromWeb(chunkStream as import("stream/web").ReadableStream);

  const writeStream = fs.createWriteStream(chunkPartPath, { mode: 0o600 });
  await pipeline(nodeStream, writeStream);

  // Atomic rename to mark chunk complete
  fs.renameSync(chunkPartPath, chunkFinalPath);

  // Update meta
  const uploadedSet = new Set(meta.uploadedChunks);
  uploadedSet.add(chunkIndex);
  meta.uploadedChunks = Array.from(uploadedSet).sort((a, b) => a - b);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), { mode: 0o600 });

  return {
    success: true,
    chunkIndex,
    totalUploaded: meta.uploadedChunks.length,
  };
}

/**
 * Returns current upload status and received chunks.
 */
export function getUploadStatus(
  galleryId: string,
  uploadId: string
): { uploadId: string; totalChunks: number; uploadedChunks: number[]; fileName: string; target: string } {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId)) {
    throw new UploadValidationError("Identifiant d'upload invalide.");
  }

  const folder = ensureGalleryImportFolder(galleryId);
  const uploadDir = path.join(getUploadsBaseDir(folder.folderPath), uploadId);
  const metaPath = path.join(uploadDir, "meta.json");

  if (!fs.existsSync(metaPath)) {
    throw new UploadValidationError("Session d'upload introuvable ou expirée.", 404);
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as UploadMetadata;

  // Authoritatively verify which chunk files exist
  const existingChunks: number[] = [];
  for (let i = 0; i < meta.totalChunks; i++) {
    if (fs.existsSync(path.join(uploadDir, `chunk_${i}`))) {
      existingChunks.push(i);
    }
  }

  return {
    uploadId,
    totalChunks: meta.totalChunks,
    uploadedChunks: existingChunks,
    fileName: meta.fileName,
    target: meta.target,
  };
}

/**
 * Assembles all chunks, verifies signature, and moves the final file to destination.
 */
export async function finalizeUpload(
  galleryId: string,
  uploadId: string
): Promise<{ success: boolean; fileName: string; target: "photos" | "videos"; alreadyExists?: boolean }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId)) {
    throw new UploadValidationError("Identifiant d'upload invalide.");
  }

  const folder = ensureGalleryImportFolder(galleryId);
  const uploadDir = path.join(getUploadsBaseDir(folder.folderPath), uploadId);
  const metaPath = path.join(uploadDir, "meta.json");

  if (!fs.existsSync(metaPath)) {
    throw new UploadValidationError("Session d'upload introuvable ou expirée.", 404);
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as UploadMetadata;

  // Verify all chunks are present
  for (let i = 0; i < meta.totalChunks; i++) {
    const chunkPath = path.join(uploadDir, `chunk_${i}`);
    if (!fs.existsSync(chunkPath)) {
      throw new UploadValidationError(`Morceau ${i + 1}/${meta.totalChunks} manquant. Veuillez reprendre l'envoi.`);
    }
  }

  // Assemble into temporary assembly file
  const assembledPath = path.join(uploadDir, "assembled.tmp");
  const writeStream = fs.createWriteStream(assembledPath, { mode: 0o600 });

  for (let i = 0; i < meta.totalChunks; i++) {
    const chunkPath = path.join(uploadDir, `chunk_${i}`);
    const chunkRead = fs.createReadStream(chunkPath);
    await new Promise<void>((resolve, reject) => {
      chunkRead.on("end", resolve);
      chunkRead.on("error", reject);
      chunkRead.pipe(writeStream, { end: false });
    });
  }
  await new Promise<void>((resolve) => writeStream.end(resolve));

  // Check assembled size
  const assembledStat = fs.statSync(assembledPath);
  if (assembledStat.size !== meta.fileSize) {
    fs.unlinkSync(assembledPath);
    throw new UploadValidationError("Taille du fichier assemblé incorrecte.");
  }

  // Validate magic bytes
  const fd = fs.openSync(assembledPath, "r");
  const headerBuf = Buffer.alloc(1024);
  const bytesRead = fs.readSync(fd, headerBuf, 0, 1024, 0);
  fs.closeSync(fd);

  const detected = detectMimeType(headerBuf.subarray(0, bytesRead));

  if (!detected) {
    fs.unlinkSync(assembledPath);
    fs.rmSync(uploadDir, { recursive: true, force: true });
    throw new UploadValidationError("Format de fichier non reconnu.", 415);
  }

  if (meta.target === "photos" && !PHOTO_MIME_TYPES.has(detected)) {
    fs.unlinkSync(assembledPath);
    fs.rmSync(uploadDir, { recursive: true, force: true });
    throw new UploadValidationError("Le fichier envoyé n'est pas une image supportée (JPEG, PNG, WEBP, AVIF).", 415);
  }

  if (meta.target === "videos" && !VIDEO_MIME_TYPES.has(detected)) {
    fs.unlinkSync(assembledPath);
    fs.rmSync(uploadDir, { recursive: true, force: true });
    throw new UploadValidationError("Le fichier envoyé n'est pas une vidéo supportée (MP4, WEBM).", 415);
  }

  // Destination directory
  const destDir = path.join(folder.folderPath, meta.target);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
  }

  let finalFileName = meta.fileName;
  let destFilePath = path.join(destDir, finalFileName);

  // Check for existing file with same name
  if (fs.existsSync(destFilePath)) {
    // Hash comparison to avoid duplicate file creation
    const hashAssembled = crypto.createHash("sha256").update(fs.readFileSync(assembledPath)).digest("hex");
    const hashExisting = crypto.createHash("sha256").update(fs.readFileSync(destFilePath)).digest("hex");

    if (hashAssembled === hashExisting) {
      // Exactly the same file content already exists!
      fs.unlinkSync(assembledPath);
      fs.rmSync(uploadDir, { recursive: true, force: true });
      return { success: true, fileName: finalFileName, target: meta.target, alreadyExists: true };
    }

    // Different content: generate unique name
    const parsed = path.parse(meta.fileName);
    let counter = 1;
    while (fs.existsSync(path.join(destDir, `${parsed.name} (${counter})${parsed.ext}`))) {
      counter++;
    }
    finalFileName = `${parsed.name} (${counter})${parsed.ext}`;
    destFilePath = path.join(destDir, finalFileName);
  }

  // Atomic move to final destination
  fs.renameSync(assembledPath, destFilePath);
  fs.chmodSync(destFilePath, 0o600);

  // Cleanup upload directory
  fs.rmSync(uploadDir, { recursive: true, force: true });

  return {
    success: true,
    fileName: finalFileName,
    target: meta.target,
  };
}

/**
 * Cancels an upload and removes its temporary directory.
 */
export function cancelUpload(galleryId: string, uploadId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId)) {
    return;
  }
  try {
    const folder = ensureGalleryImportFolder(galleryId);
    const uploadDir = path.join(getUploadsBaseDir(folder.folderPath), uploadId);
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
}
