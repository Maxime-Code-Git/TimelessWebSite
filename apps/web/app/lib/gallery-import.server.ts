import * as fs from "node:fs";
import * as path from "node:path";
import crypto from "node:crypto";
import { ENV } from "./env.server";
import { getGalleryDb } from "./gallery-db.server";
import sharp from "sharp";

const MAX_MEDIA_COUNT = 1000;
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB per file
const MAX_TOTAL_SIZE = 50 * 1024 * 1024 * 1024; // 50 GB total

const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm"]);

let workerStarted = false;

function validateImportPath(folderName: string): string {
  const baseReal = fs.realpathSync(ENV.GALLERY_IMPORT_PATH);

  // Check the folder itself is not a symlink
  const candidatePath = path.resolve(ENV.GALLERY_IMPORT_PATH, folderName);
  const candidateStat = fs.lstatSync(candidatePath);
  if (candidateStat.isSymbolicLink()) {
    throw new Error("Import folder cannot be a symbolic link");
  }

  const candidate = fs.realpathSync(candidatePath);
  if (candidate !== baseReal && !candidate.startsWith(baseReal + path.sep)) {
    throw new Error("Invalid import path: outside base directory");
  }

  return candidate;
}

export function getAvailableImportFolders(): string[] {
  const importDir = ENV.GALLERY_IMPORT_PATH;
  if (!fs.existsSync(importDir)) return [];
  const entries = fs.readdirSync(importDir, { withFileTypes: true });
  return entries
    .filter(e => {
      if (!e.isDirectory()) return false;
      // Verify not a symlink
      const fullPath = path.join(importDir, e.name);
      const stat = fs.lstatSync(fullPath);
      return !stat.isSymbolicLink();
    })
    .map(e => e.name);
}

function detectMimeType(buffer: Buffer): string | null {
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

type Visibility = "invites" | "maries";
type MediaCategory = "photos" | "videos";

interface FileToProcess {
  fullPath: string;
  name: string;
  visibility: Visibility;
  expectedCategory: MediaCategory;
}

interface RejectedFile {
  file: string;
  reason: string;
}

function scanFolderForFiles(
  basePath: string,
  subFolder: string,
  visibility: Visibility,
  expectedCategory: MediaCategory,
  rejected: RejectedFile[]
): FileToProcess[] {
  const targetDir = path.join(basePath, subFolder);
  if (!fs.existsSync(targetDir)) return [];

  const files: FileToProcess[] = [];
  const scan = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      const stat = fs.lstatSync(fullPath);
      if (stat.isSymbolicLink()) {
        rejected.push({ file: entry.name, reason: "Les liens symboliques sont interdits." });
        continue;
      }

      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile()) {
        if (!entry.name.startsWith(".")) {
          files.push({ fullPath, name: entry.name, visibility, expectedCategory });
        }
      }
    }
  };
  scan(targetDir);
  return files;
}

function validateFileType(mimeType: string, expectedCategory: MediaCategory, fileName: string, rejected: RejectedFile[]): boolean {
  const isPhoto = PHOTO_MIME_TYPES.has(mimeType);
  const isVideo = VIDEO_MIME_TYPES.has(mimeType);

  if (!isPhoto && !isVideo) {
    rejected.push({ file: fileName, reason: "Format non supporté ou inconnu" });
    return false;
  }

  if (expectedCategory === "photos" && !isPhoto) {
    rejected.push({ file: fileName, reason: "Fichier vidéo trouvé dans le dossier photos" });
    return false;
  }

  if (expectedCategory === "videos" && !isVideo) {
    rejected.push({ file: fileName, reason: "Fichier photo trouvé dans le dossier vidéos" });
    return false;
  }

  return true;
}

function collectFiles(importDir: string, rejected: RejectedFile[]): FileToProcess[] {
  return [
    ...scanFolderForFiles(importDir, "invites/photos", "invites", "photos", rejected),
    ...scanFolderForFiles(importDir, "invites/videos", "invites", "videos", rejected),
    ...scanFolderForFiles(importDir, "maries/photos", "maries", "photos", rejected),
    ...scanFolderForFiles(importDir, "maries/videos", "maries", "videos", rejected)
  ];
}

export async function getImportPreview(folderName: string) {
  const importDir = validateImportPath(folderName);
  const rejected: RejectedFile[] = [];
  const files = collectFiles(importDir, rejected);

  if (files.length > MAX_MEDIA_COUNT) {
    throw new Error(`Trop de fichiers (${files.length}), maximum ${MAX_MEDIA_COUNT}.`);
  }

  let validInvitesPhotos = 0;
  let validInvitesVideos = 0;
  let validMariesPhotos = 0;
  let validMariesVideos = 0;
  let totalSize = 0;

  for (const file of files) {
    try {
      const stat = fs.statSync(file.fullPath);
      if (stat.size > MAX_FILE_SIZE) {
        rejected.push({ file: file.name, reason: `Fichier trop volumineux (${Math.round(stat.size / 1024 / 1024)} Mo)` });
        continue;
      }
      totalSize += stat.size;
      if (totalSize > MAX_TOTAL_SIZE) {
        rejected.push({ file: file.name, reason: "Taille totale dépasse la limite" });
        continue;
      }

      const fd = fs.openSync(file.fullPath, "r");
      const header = Buffer.alloc(1024);
      const bytesRead = fs.readSync(fd, header, 0, 1024, 0);
      fs.closeSync(fd);
      const mimeType = detectMimeType(header.subarray(0, bytesRead));
      if (!mimeType || !validateFileType(mimeType, file.expectedCategory, file.name, rejected)) {
        continue;
      }

      const isPhoto = PHOTO_MIME_TYPES.has(mimeType);
      if (file.visibility === "invites") {
        if (isPhoto) validInvitesPhotos++;
        else validInvitesVideos++;
      } else {
        if (isPhoto) validMariesPhotos++;
        else validMariesVideos++;
      }
    } catch {
      rejected.push({ file: file.name, reason: "Erreur de lecture" });
    }
  }

  return {
    folder: folderName,
    invitesPhotosCount: validInvitesPhotos,
    invitesVideosCount: validInvitesVideos,
    mariesPhotosCount: validMariesPhotos,
    mariesVideosCount: validMariesVideos,
    total: validInvitesPhotos + validInvitesVideos + validMariesPhotos + validMariesVideos,
    rejected
  };
}

export function startGalleryImport(galleryId: string, folderName: string): string {
  const db = getGalleryDb();

  // Prevent concurrent imports
  const active = db.prepare(
    "SELECT id FROM gallery_imports WHERE gallery_id = ? AND status IN ('pending', 'processing')"
  ).get(galleryId);
  if (active) {
    throw new Error("Un import est déjà en cours pour cette galerie.");
  }

  // Validate path early
  validateImportPath(folderName);

  db.prepare("UPDATE galleries SET import_path = ? WHERE id = ?").run(folderName, galleryId);

  const importId = crypto.randomUUID();
  const now = Date.now();

  db.prepare("INSERT INTO gallery_imports (id, gallery_id, status, progress, total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(importId, galleryId, "pending", 0, 0, now, now);

  // Trigger worker
  scheduleWorker();

  return importId;
}

/**
 * Atomic job acquisition: attempts to claim exactly one pending job.
 * Returns the job if acquired, null otherwise.
 */
function acquireNextJob(): { id: string; gallery_id: string; import_path: string } | null {
  const db = getGalleryDb();

  // Find the oldest pending job
  const pending = db.prepare(
    "SELECT gi.id, gi.gallery_id, g.import_path FROM gallery_imports gi JOIN galleries g ON gi.gallery_id = g.id WHERE gi.status = 'pending' ORDER BY gi.created_at ASC LIMIT 1"
  ).get() as { id: string; gallery_id: string; import_path: string } | undefined;

  if (!pending) return null;

  // Atomically transition from pending to processing
  const result = db.prepare(
    "UPDATE gallery_imports SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'pending'"
  ).run(Date.now(), pending.id);

  // Verify exactly one row was modified
  if (result.changes !== 1) return null;

  return pending;
}

/**
 * Reset interrupted jobs (processing -> pending) on startup.
 * Must be called before worker starts processing.
 */
export function resetInterruptedImports(): void {
  const db = getGalleryDb();
  const reset = db.prepare(
    "UPDATE gallery_imports SET status = 'pending', updated_at = ? WHERE status = 'processing'"
  ).run(Date.now());
  if (reset.changes > 0) {
    console.log(`Reset ${reset.changes} interrupted import(s) to pending`);
  }
}

export function resumeImports(): void {
  if (workerStarted) return;
  workerStarted = true;

  resetInterruptedImports();
  scheduleWorker();
}

function scheduleWorker(): void {
  // Use setImmediate to avoid blocking the event loop
  setImmediate(() => {
    void runWorkerLoop().catch(err => {
      console.error("Import worker error:", err);
    });
  });
}

async function runWorkerLoop(): Promise<void> {
  let job = acquireNextJob();
  while (job) {
    if (job.import_path) {
      await processImport(job.id, job.gallery_id, job.import_path);
    }
    job = acquireNextJob();
  }
}

async function processImport(importId: string, galleryId: string, folderName: string): Promise<void> {
  const db = getGalleryDb();

  try {
    const importDir = validateImportPath(folderName);

    const ignoredFiles: RejectedFile[] = [];
    const files = collectFiles(importDir, ignoredFiles);

    if (files.length > MAX_MEDIA_COUNT) {
      throw new Error(`La galerie dépasse la limite de ${MAX_MEDIA_COUNT} médias.`);
    }

    db.prepare("UPDATE gallery_imports SET total = ?, updated_at = ? WHERE id = ?")
      .run(files.length, Date.now(), importId);

    const mediaDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId);
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    } else {
      // Cleanup orphan .tmp files from previous crashed runs
      const existingFiles = fs.readdirSync(mediaDir);
      for (const f of existingFiles) {
        if (f.endsWith(".tmp")) {
          fs.unlinkSync(path.join(mediaDir, f));
        }
      }
    }

    let progress = 0;
    const results = { imported: 0, ignored: [...ignoredFiles] };

    for (const file of files) {
      try {
        // Re-stat to prevent TOCTOU — use the file descriptor for all operations
        const fd = fs.openSync(file.fullPath, "r");
        try {
          const stat = fs.fstatSync(fd);
          if (stat.size > MAX_FILE_SIZE) {
            results.ignored.push({ file: file.name, reason: `Fichier trop volumineux` });
            continue;
          }

          // Read header for MIME detection from the same fd
          const header = Buffer.alloc(1024);
          const bytesRead = fs.readSync(fd, header, 0, 1024, 0);
          const mimeType = detectMimeType(header.subarray(0, bytesRead));

          if (!mimeType || !validateFileType(mimeType, file.expectedCategory, file.name, results.ignored)) {
            continue;
          }

          const type = PHOTO_MIME_TYPES.has(mimeType) ? "photo" : "video";

          // Calculate SHA-256 from the fd path (re-open stream from same path)
          // Close fd first, then hash from path — acceptable since we've validated
          fs.closeSync(fd);

          const hash = await new Promise<string>((resolve, reject) => {
            const stream = fs.createReadStream(file.fullPath);
            const h = crypto.createHash("sha256");
            stream.on("data", chunk => h.update(chunk));
            stream.on("end", () => resolve(h.digest("hex")));
            stream.on("error", reject);
          });

          // Check duplicates
          const existing = db.prepare("SELECT id FROM gallery_media WHERE gallery_id = ? AND hash = ?").get(galleryId, hash);
          if (existing) {
            results.ignored.push({ file: file.name, reason: "Doublon (même contenu exact)" });
            continue;
          }

          let width: number | null = null;
          let height: number | null = null;
          if (type === "photo") {
            const metadata = await sharp(file.fullPath).metadata();
            width = metadata.width || null;
            height = metadata.height || null;
            if (metadata.orientation && metadata.orientation >= 5) {
              width = metadata.height || null;
              height = metadata.width || null;
            }
          }

          const mediaId = crypto.randomUUID();
          const destPath = path.join(mediaDir, mediaId);
          const tmpPath = destPath + ".tmp";

          try {
            fs.copyFileSync(file.fullPath, tmpPath);
            fs.renameSync(tmpPath, destPath);
          } catch (copyErr) {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            throw copyErr;
          }

          // Verify the copied file's hash matches to prevent TOCTOU
          const verifyHash = await new Promise<string>((resolve, reject) => {
            const stream = fs.createReadStream(destPath);
            const h = crypto.createHash("sha256");
            stream.on("data", chunk => h.update(chunk));
            stream.on("end", () => resolve(h.digest("hex")));
            stream.on("error", reject);
          });

          if (verifyHash !== hash) {
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            results.ignored.push({ file: file.name, reason: "Fichier modifié pendant l'import (hash mismatch)" });
            continue;
          }

          try {
            db.prepare(`
              INSERT INTO gallery_media (id, gallery_id, type, visibility, original_name, mime_type, size, hash, width, height, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(mediaId, galleryId, type, file.visibility, file.name, mimeType, stat.size, hash, width, height, Date.now());
          } catch (dbErr) {
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            throw dbErr;
          }

          results.imported++;
          continue; // Skip the finally fd close since we already closed it
        } catch (innerErr) {
          // fd might already be closed
          try { fs.closeSync(fd); } catch { /* already closed */ }
          throw innerErr;
        }
      } catch (err) {
        results.ignored.push({ file: file.name, reason: "Erreur: " + (err instanceof Error ? err.message : String(err)) });
      } finally {
        progress++;
        db.prepare("UPDATE gallery_imports SET progress = ?, updated_at = ? WHERE id = ?").run(progress, Date.now(), importId);
      }
    }

    db.prepare("UPDATE gallery_imports SET status = 'completed', result_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(results), Date.now(), importId);

  } catch (err) {
    db.prepare("UPDATE gallery_imports SET status = 'failed', result_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), Date.now(), importId);
  }
}
