import * as fs from "node:fs";
import * as path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { ensureGalleryImportFolder } from "./gallery-folder.server";

export const MAX_PHOTO_SIZE = 100 * 1024 * 1024; // 100 MB max for photos
export const MAX_VIDEO_SIZE = 20 * 1024 * 1024 * 1024; // 20 GB max for videos (21474836480 bytes, safe integer)
export const MAX_FILE_SIZE = MAX_VIDEO_SIZE;
export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk (Cloudflare & memory friendly)
export const MIN_CHUNK_SIZE = 256 * 1024; // 256 KB min chunk (unless file is smaller)
export const MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB max chunk size
export const MAX_TOTAL_CHUNKS = 5000; // 5000 chunks max per file (allows 20 GB at 5 MB chunks = 4096 chunks)
export const MAX_BATCH_FILES = 2000; // 2000 files max per selection/batch
export const MAX_ACTIVE_SESSIONS_PER_TARGET = 2; // 2 active sessions max per gallery and target
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

export const uploadLock = {
  isLocked: false,
  runSync<T>(fn: () => T): T {
    if (this.isLocked) {
      throw new UploadValidationError("Une initialisation d'upload est déjà en cours. Veuillez réessayer.", 429);
    }
    this.isLocked = true;
    try {
      return fn();
    } finally {
      this.isLocked = false;
    }
  },
};

/**
 * Computes all unallocated future disk space reservations from active upload sessions.
 * Survives server restarts by reading meta.json and chunk files directly from disk.
 */
export function computeAllActiveDiskReservations(basePath: string, excludeUploadId?: string): number {
  if (!fs.existsSync(basePath)) return 0;
  let totalReserved = 0;
  const now = Date.now();
  const maxAgeMs = 24 * 60 * 60 * 1000;

  const processTmpUploadsDir = (tmpUploadsDir: string) => {
    if (!fs.existsSync(tmpUploadsDir)) return;
    try {
      const uploadDirs = fs.readdirSync(tmpUploadsDir, { withFileTypes: true });
      for (const uDir of uploadDirs) {
        if (!uDir.isDirectory()) continue;
        if (excludeUploadId && uDir.name === excludeUploadId) continue;

        const uploadPath = path.join(tmpUploadsDir, uDir.name);
        const metaPath = path.join(uploadPath, "meta.json");
        if (!fs.existsSync(metaPath)) continue;

        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as UploadMetadata;
          if (now - meta.createdAt > maxAgeMs) continue;

          let bytesOnDisk = 0;
          try {
            const files = fs.readdirSync(uploadPath);
            for (const f of files) {
              if (f.startsWith("chunk_") || f === "assembled.tmp") {
                const st = fs.statSync(path.join(uploadPath, f));
                bytesOnDisk += st.size;
              }
            }
          } catch {
            // ignore
          }

          const peakNeeded = meta.fileSize * 2;
          const remainingReservation = Math.max(0, peakNeeded - bytesOnDisk);
          totalReserved += remainingReservation;
        } catch {
          // ignore corrupted meta
        }
      }
    } catch {
      // ignore
    }
  };

  try {
    const directTmp = path.join(basePath, ".tmp_uploads");
    if (fs.existsSync(directTmp)) {
      processTmpUploadsDir(directTmp);
    }

    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== ".tmp_uploads") {
        const childTmp = path.join(basePath, entry.name, ".tmp_uploads");
        processTmpUploadsDir(childTmp);
      }
    }
  } catch (err) {
    console.warn("Could not compute active disk reservations:", err);
  }

  return totalReserved;
}

/**
 * Counts currently active sessions for a specific gallery and target (photos/videos).
 */
export function countActiveSessionsForTarget(
  galleryFolderPath: string,
  galleryId: string,
  target: "photos" | "videos"
): number {
  const tmpUploadsDir = path.join(galleryFolderPath, ".tmp_uploads");
  if (!fs.existsSync(tmpUploadsDir)) return 0;
  let count = 0;
  const now = Date.now();
  const maxAgeMs = 24 * 60 * 60 * 1000;

  try {
    const entries = fs.readdirSync(tmpUploadsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(tmpUploadsDir, entry.name, "meta.json");
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as UploadMetadata;
          if (meta.galleryId === galleryId && meta.target === target && (now - meta.createdAt <= maxAgeMs)) {
            count++;
          }
        } catch {
          // ignore corrupted meta
        }
      }
    }
  } catch {
    // ignore
  }

  return count;
}

/**
 * Checks available disk space on the filesystem of targetPath,
 * accounting for existing active reservations and the safety buffer.
 */
export function checkDiskSpace(
  targetPath: string,
  requiredBytes: number,
  importBasePath?: string,
  excludeUploadId?: string
): void {
  try {
    const stats = diskChecker.statfs(targetPath);
    const rawFreeBytes = stats.bavail * stats.bsize;
    const base = importBasePath || path.dirname(targetPath);
    const activeReservations = computeAllActiveDiskReservations(base, excludeUploadId);

    const effectiveFreeBytes = rawFreeBytes - activeReservations;
    if (effectiveFreeBytes < requiredBytes + SAFETY_BUFFER_BYTES) {
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
            try {
              const stat = fs.statSync(uploadDir);
              if (now - stat.mtimeMs > maxAgeMs) shouldRemove = true;
            } catch {
              // ignore
            }
          }
        } else {
          try {
            const stat = fs.statSync(uploadDir);
            if (now - stat.mtimeMs > maxAgeMs) shouldRemove = true;
          } catch {
            // ignore
          }
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
  return uploadLock.runSync(() => {
    if (params.target !== "photos" && params.target !== "videos") {
      throw new UploadValidationError("Cible d'import invalide (photos ou videos requis).");
    }

    const cleanName = sanitizeUploadFileName(params.fileName);
    if (!cleanName || cleanName === "fichier") {
      throw new UploadValidationError("Nom de fichier invalide.");
    }

    if (
      typeof params.fileSize !== "number" ||
      !Number.isSafeInteger(params.fileSize) ||
      params.fileSize <= 0
    ) {
      throw new UploadValidationError("Taille de fichier invalide (doit être un entier positif).");
    }

    if (params.target === "photos" && params.fileSize > MAX_PHOTO_SIZE) {
      throw new UploadValidationError(`Taille de photo trop grande (maximum ${Math.round(MAX_PHOTO_SIZE / 1024 / 1024)} Mo).`);
    }

    if (params.target === "videos" && params.fileSize > MAX_VIDEO_SIZE) {
      throw new UploadValidationError(`Taille de vidéo trop grande (maximum ${Math.round(MAX_VIDEO_SIZE / 1024 / 1024 / 1024)} Go).`);
    }

    let chunkSize = DEFAULT_CHUNK_SIZE;
    if (params.chunkSize !== undefined) {
      if (
        typeof params.chunkSize !== "number" ||
        !Number.isSafeInteger(params.chunkSize) ||
        params.chunkSize <= 0 ||
        params.chunkSize > MAX_CHUNK_SIZE
      ) {
        throw new UploadValidationError(`Taille de morceau invalide (maximum ${Math.round(MAX_CHUNK_SIZE / 1024 / 1024)} Mo).`);
      }
      chunkSize = params.chunkSize;
    }

    const calculatedTotalChunks = Math.ceil(params.fileSize / chunkSize);
    if (calculatedTotalChunks > MAX_TOTAL_CHUNKS) {
      throw new UploadValidationError(`Nombre de morceaux trop élevé (maximum ${MAX_TOTAL_CHUNKS}).`);
    }

    if (
      typeof params.totalChunks !== "number" ||
      !Number.isSafeInteger(params.totalChunks) ||
      params.totalChunks !== calculatedTotalChunks
    ) {
      throw new UploadValidationError(`Nombre de morceaux incohérent (attendu ${calculatedTotalChunks}, reçu ${params.totalChunks}).`);
    }

    const folder = ensureGalleryImportFolder(galleryId);
    cleanupAbandonedUploads(folder.folderPath);

    const activeSessions = countActiveSessionsForTarget(folder.folderPath, galleryId, params.target);
    if (activeSessions >= MAX_ACTIVE_SESSIONS_PER_TARGET) {
      throw new UploadValidationError(
        `Nombre maximal de sessions actives atteint (${MAX_ACTIVE_SESSIONS_PER_TARGET} par type de média). Veuillez attendre la fin des transferts en cours.`,
        429
      );
    }

    // Vérification de l'espace disque pour le pic d'assemblage : morceaux + fichier final + réserve de sécurité
    const importBase = path.dirname(folder.folderPath);
    checkDiskSpace(folder.folderPath, params.fileSize * 2, importBase);

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
    const tmpMetaPath = path.join(uploadDir, `meta.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
    fs.writeFileSync(tmpMetaPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });
    fs.renameSync(tmpMetaPath, metaPath);

    return {
      uploadId,
      chunkSize,
      totalChunks: calculatedTotalChunks,
      uploadedChunks: [],
    };
  });
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

  // Rattachement strict de l'uploadId à la galerie
  if (meta.galleryId !== galleryId) {
    throw new UploadValidationError("L'upload n'appartient pas à cette galerie.", 403);
  }

  if (
    typeof chunkIndex !== "number" ||
    !Number.isSafeInteger(chunkIndex) ||
    chunkIndex < 0 ||
    chunkIndex >= meta.totalChunks
  ) {
    throw new UploadValidationError("Index de morceau invalide.");
  }

  const expectedChunkSize = (chunkIndex === meta.totalChunks - 1)
    ? meta.fileSize - (meta.totalChunks - 1) * meta.chunkSize
    : meta.chunkSize;

  const importBase = path.dirname(folder.folderPath);
  checkDiskSpace(folder.folderPath, expectedChunkSize, importBase, uploadId);

  const chunkPartPath = path.join(uploadDir, `chunk_${chunkIndex}.part`);
  const chunkFinalPath = path.join(uploadDir, `chunk_${chunkIndex}`);

  const nodeStream = "pipe" in chunkStream
    ? (chunkStream as NodeJS.ReadableStream)
    : Readable.fromWeb(chunkStream as import("stream/web").ReadableStream);

  const writeStream = fs.createWriteStream(chunkPartPath, { mode: 0o600 });
  await pipeline(nodeStream, writeStream);

  // Vérification de la taille exacte reçue
  const chunkStat = fs.statSync(chunkPartPath);
  if (chunkStat.size !== expectedChunkSize) {
    try { fs.unlinkSync(chunkPartPath); } catch { /* ignore */ }
    throw new UploadValidationError(`Taille du morceau invalide (reçu ${chunkStat.size} octets, attendu ${expectedChunkSize} octets).`);
  }

  // Atomic rename to mark chunk complete
  fs.renameSync(chunkPartPath, chunkFinalPath);

  // Update meta
  const uploadedSet = new Set(meta.uploadedChunks);
  uploadedSet.add(chunkIndex);
  meta.uploadedChunks = Array.from(uploadedSet).sort((a, b) => a - b);
  const tmpMetaPath = path.join(uploadDir, `meta.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  fs.writeFileSync(tmpMetaPath, JSON.stringify(meta, null, 2), { mode: 0o600 });
  fs.renameSync(tmpMetaPath, metaPath);

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

  // Rattachement strict de l'uploadId à la galerie
  if (meta.galleryId !== galleryId) {
    throw new UploadValidationError("L'upload n'appartient pas à cette galerie.", 403);
  }

  // Authoritatively verify which chunk files exist and have exact expected size
  const existingChunks: number[] = [];
  for (let i = 0; i < meta.totalChunks; i++) {
    const chunkPath = path.join(uploadDir, `chunk_${i}`);
    if (fs.existsSync(chunkPath)) {
      const stat = fs.statSync(chunkPath);
      const expectedSize = (i === meta.totalChunks - 1)
        ? meta.fileSize - (meta.totalChunks - 1) * meta.chunkSize
        : meta.chunkSize;
      if (stat.size === expectedSize) {
        existingChunks.push(i);
      }
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
 * Assembles all chunks, verifies signature, size bounds and moves the final file to destination.
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

  // Rattachement strict de l'uploadId à la galerie
  if (meta.galleryId !== galleryId) {
    throw new UploadValidationError("L'upload n'appartient pas à cette galerie.", 403);
  }

  // Contrôle d'espace disque juste avant finalize pour la création du fichier assemblé
  // (les morceaux occupent déjà fileSize sur disque, il faut fileSize supplémentaire disponible)
  const importBase = path.dirname(folder.folderPath);
  checkDiskSpace(folder.folderPath, meta.fileSize, importBase, uploadId);

  // Verify all chunks are present and match their exact expected size
  let totalChunksSize = 0;
  for (let i = 0; i < meta.totalChunks; i++) {
    const chunkPath = path.join(uploadDir, `chunk_${i}`);
    if (!fs.existsSync(chunkPath)) {
      throw new UploadValidationError(`Morceau ${i + 1}/${meta.totalChunks} manquant. Veuillez reprendre l'envoi.`);
    }
    const chunkStat = fs.statSync(chunkPath);
    const expectedSize = (i === meta.totalChunks - 1)
      ? meta.fileSize - (meta.totalChunks - 1) * meta.chunkSize
      : meta.chunkSize;
    if (chunkStat.size !== expectedSize) {
      throw new UploadValidationError(`Taille du morceau ${i + 1} incohérente (reçu ${chunkStat.size}, attendu ${expectedSize}).`);
    }
    totalChunksSize += chunkStat.size;
  }

  if (totalChunksSize !== meta.fileSize) {
    throw new UploadValidationError("Somme des tailles des morceaux incohérente avec la taille déclarée.");
  }

  // Assemble into temporary assembly file
  const assembledPath = path.join(uploadDir, "assembled.tmp");
  if (fs.existsSync(assembledPath)) {
    try { fs.unlinkSync(assembledPath); } catch { /* ignore */ }
  }

  if (meta.totalChunks === 1) {
    const chunkPath = path.join(uploadDir, "chunk_0");
    if (!fs.existsSync(chunkPath)) {
      throw new UploadValidationError("Morceau 1/1 manquant. Veuillez reprendre l'envoi.");
    }
    fs.copyFileSync(chunkPath, assembledPath);
    fs.chmodSync(assembledPath, 0o600);
  } else {
    const writeStream = fs.createWriteStream(assembledPath, { mode: 0o600 });
    for (let i = 0; i < meta.totalChunks; i++) {
      const chunkPath = path.join(uploadDir, `chunk_${i}`);
      if (!fs.existsSync(chunkPath)) {
        writeStream.destroy();
        throw new UploadValidationError(`Morceau ${i + 1}/${meta.totalChunks} manquant. Veuillez reprendre l'envoi.`);
      }
      await new Promise<void>((resolve, reject) => {
        const chunkRead = fs.createReadStream(chunkPath);
        chunkRead.on("error", (err) => {
          writeStream.destroy();
          reject(err);
        });
        writeStream.on("error", reject);
        chunkRead.on("end", () => {
          writeStream.removeListener("error", reject);
          resolve();
        });
        chunkRead.pipe(writeStream, { end: false });
      });
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.on("error", reject);
      writeStream.on("close", resolve);
      writeStream.end();
    });
  }

  // Check assembled size
  const assembledStat = fs.statSync(assembledPath);
  if (assembledStat.size !== meta.fileSize) {
    try { fs.unlinkSync(assembledPath); } catch { /* ignore */ }
    throw new UploadValidationError("Taille du fichier assemblé incorrecte.");
  }

  // Validate magic bytes
  const fd = fs.openSync(assembledPath, "r");
  const headerBuf = Buffer.alloc(1024);
  const bytesRead = fs.readSync(fd, headerBuf, 0, 1024, 0);
  fs.closeSync(fd);

  const detected = detectMimeType(headerBuf.subarray(0, bytesRead));

  if (!detected) {
    try { fs.unlinkSync(assembledPath); } catch { /* ignore */ }
    fs.rmSync(uploadDir, { recursive: true, force: true });
    throw new UploadValidationError("Format de fichier non reconnu.", 415);
  }

  if (meta.target === "photos" && !PHOTO_MIME_TYPES.has(detected)) {
    try { fs.unlinkSync(assembledPath); } catch { /* ignore */ }
    fs.rmSync(uploadDir, { recursive: true, force: true });
    throw new UploadValidationError("Le fichier envoyé n'est pas une image supportée (JPEG, PNG, WEBP, AVIF).", 415);
  }

  if (meta.target === "videos" && !VIDEO_MIME_TYPES.has(detected)) {
    try { fs.unlinkSync(assembledPath); } catch { /* ignore */ }
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
      try { fs.unlinkSync(assembledPath); } catch { /* ignore */ }
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
    const metaPath = path.join(uploadDir, "meta.json");
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as UploadMetadata;
      if (meta.galleryId !== galleryId) {
        return;
      }
    }
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
}
