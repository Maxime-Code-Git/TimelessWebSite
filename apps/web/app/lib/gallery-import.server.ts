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

  // Validate path early
  validateImportPath(folderName);

  db.prepare("UPDATE galleries SET import_path = ? WHERE id = ?").run(folderName, galleryId);

  const importId = crypto.randomUUID();
  const now = Date.now();

  try {
    db.prepare("INSERT INTO gallery_imports (id, gallery_id, status, progress, total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(importId, galleryId, "pending", 0, 0, now, now);
  } catch (err: unknown) {
    if (err instanceof Error && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new Error("Un import est déjà en cours pour cette galerie.", { cause: err });
    }
    throw new Error(err instanceof Error ? err.message : String(err), { cause: err });
  }

  // Trigger worker
  if (!process.env.__TEST_DISABLE_WORKER) scheduleWorker();

  return importId;
}

/**
 * Atomic job acquisition: attempts to claim exactly one pending job.
 * Returns the job if acquired, null otherwise.
 */
let LEASE_DURATION_MS = 30000;
export function __setLeaseDurationForTest(ms: number) { LEASE_DURATION_MS = ms; }

export function acquireNextJob(): { id: string; gallery_id: string; import_path: string; lease_token: string } | null {
  const leaseToken = crypto.randomUUID();
  const db = getGalleryDb();
  const now = Date.now();
  const expiresAt = now + LEASE_DURATION_MS;

  const result = db.prepare(`
    UPDATE gallery_imports
    SET status = 'processing', worker_id = ?, lease_expires_at = ?, attempt_count = attempt_count + 1, updated_at = ?
    WHERE id = (
      SELECT id FROM gallery_imports
      WHERE status = 'pending' OR (status = 'processing' AND lease_expires_at < ?)
      ORDER BY created_at ASC
      LIMIT 1
    )
    RETURNING id, gallery_id
  `).get(leaseToken, expiresAt, now, now) as { id: string; gallery_id: string } | undefined;

  if (!result) return null;

  const gallery = db.prepare("SELECT import_path FROM galleries WHERE id = ?").get(result.gallery_id) as { import_path: string };
  return { id: result.id, gallery_id: result.gallery_id, import_path: gallery.import_path, lease_token: leaseToken };
}

export function resumeImports(): void {
  if (workerStarted) return;
  workerStarted = true;
  if (!process.env.__TEST_DISABLE_WORKER) scheduleWorker();
}

function scheduleWorker(): void {
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
      await processImport(job.id, job.gallery_id, job.import_path, job.lease_token);
    }
    job = acquireNextJob();
  }
}

export async function processImport(importId: string, galleryId: string, folderName: string, leaseToken: string): Promise<void> {
  const db = getGalleryDb();
  let leaseTimer: NodeJS.Timeout | null = null;
    let canceled = false;
    const checkLease = () => {
      if (canceled) return false;
      const res = db.prepare("UPDATE gallery_imports SET lease_expires_at = ? WHERE id = ? AND worker_id = ? AND status = 'processing' AND lease_expires_at >= ?")
        .run(Date.now() + LEASE_DURATION_MS, importId, leaseToken, Date.now()); // allow some skew, but reject completely expired leases by others. Actually, if someone stole it, worker_id changed. If it expired but not stolen, we can still renew it if it hasn't been stolen. Wait! The instruction says: "Un bail déjà expiré ne doit pas pouvoir être renouvelé par son ancien propriétaire." So lease_expires_at > Date.now().
      if (res.changes === 0) {
        canceled = true;
      }
      return !canceled;
    };

  try {
    const importDir = validateImportPath(folderName);
    const ignoredFiles: RejectedFile[] = [];
    const files = collectFiles(importDir, ignoredFiles);

    if (files.length > MAX_MEDIA_COUNT) {
      throw new Error(`La galerie dépasse la limite de ${MAX_MEDIA_COUNT} médias.`);
    }

    db.prepare("UPDATE gallery_imports SET total = ?, updated_at = ? WHERE id = ? AND worker_id = ?")
      .run(files.length, Date.now(), importId, leaseToken);

    leaseTimer = setInterval(() => {
      if (!checkLease()) clearInterval(leaseTimer!);
    }, LEASE_DURATION_MS / 2);

    const mediaDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId);
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    if (!checkLease()) throw new Error("Lease lost before reconciliation");
    // RECONCILIATION
    const existingFiles = fs.readdirSync(mediaDir);
    const tmpFiles = existingFiles.filter(f => f.endsWith(".tmp"));
    const finalFiles = existingFiles.filter(f => !f.endsWith(".tmp"));

    // 1. Check tmp files: if DB has them, recover by renaming. Else, delete.
    for (const tmp of tmpFiles) {
      if (!checkLease()) throw new Error("Lease lost");
      const mediaId = tmp.replace(".tmp", "");
      const existsInDb = db.prepare("SELECT id FROM gallery_media WHERE id = ?").get(mediaId);
      if (existsInDb) {
        try { fs.renameSync(path.join(mediaDir, tmp), path.join(mediaDir, mediaId)); } catch { /* ignore */ }
        finalFiles.push(mediaId); // now it's a final file
      } else {
        try { fs.unlinkSync(path.join(mediaDir, tmp)); } catch { /* ignore */ }
      }
    }

    // 2. Check orphan final files: if not in DB, delete.
    for (const f of finalFiles) {
      if (!checkLease()) throw new Error("Lease lost");
      const existsInDb = db.prepare("SELECT id FROM gallery_media WHERE id = ?").get(f);
      if (!existsInDb) {
        try { fs.unlinkSync(path.join(mediaDir, f)); } catch { /* ignore */ }
      }
    }

    // 3. Check phantom DB records for this gallery: if file missing, delete record.
    const dbRecords = db.prepare("SELECT id FROM gallery_media WHERE gallery_id = ?").all(galleryId) as { id: string }[];
    for (const rec of dbRecords) {
      if (!checkLease()) throw new Error("Lease lost");
      if (!fs.existsSync(path.join(mediaDir, rec.id))) {
        db.prepare("DELETE FROM gallery_media WHERE id = ?").run(rec.id);
      }
    }

    let progress = 0;
    const results = { imported: 0, ignored: [...ignoredFiles] };
    let currentTotalSize = 0;

    for (const file of files) {
      if (!checkLease()) break;
      let fd: number | null = null;
      let tmpPath: string | null = null;
      let destPath: string | null = null;
      let inserted = false;

      try {
        const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
        fd = fs.openSync(file.fullPath, flags);

        const stat = fs.fstatSync(fd);
        if (!stat.isFile()) {
          results.ignored.push({ file: file.name, reason: "N'est pas un fichier régulier" });
          continue;
        }

        if (stat.size > MAX_FILE_SIZE) {
          results.ignored.push({ file: file.name, reason: "Fichier trop volumineux" });
          continue;
        }

        if (currentTotalSize + stat.size > MAX_TOTAL_SIZE) {
          results.ignored.push({ file: file.name, reason: "Limite totale de stockage atteinte" });
          continue;
        }

        const header = Buffer.alloc(1024);
        const bytesRead = fs.readSync(fd, header, 0, 1024, 0);
        const mimeType = detectMimeType(header.subarray(0, bytesRead));

        if (!mimeType || !validateFileType(mimeType, file.expectedCategory, file.name, results.ignored)) {
          continue;
        }

        const type = PHOTO_MIME_TYPES.has(mimeType) ? "photo" : "video";
        const mediaId = crypto.randomUUID();
        destPath = path.join(mediaDir, mediaId);
        tmpPath = destPath + ".tmp";

        // TOCTOU FIX: Hash and copy from the open descriptor
        const hash = crypto.createHash("sha256");
        const readStream = fs.createReadStream("", { fd, autoClose: false }); // reads from beginning because file position is unchanged by readSync(,,0)
        const writeStream = fs.createWriteStream(tmpPath);

        await new Promise<void>((resolve, reject) => {
          readStream.on("data", chunk => hash.update(chunk));
          readStream.pipe(writeStream);
          writeStream.on("finish", resolve);
          writeStream.on("error", reject);
          readStream.on("error", reject);
        });

        if (!checkLease()) throw new Error("Lease lost");
        const finalHash = hash.digest("hex");

        fs.closeSync(fd);
        fd = null;

        const existing = db.prepare("SELECT id FROM gallery_media WHERE gallery_id = ? AND hash = ?").get(galleryId, finalHash);
        if (existing) {
          results.ignored.push({ file: file.name, reason: "Doublon (même contenu exact)" });
          continue;
        }

        let width: number | null = null;
        let height: number | null = null;
        if (type === "photo") {
          const metadata = await sharp(tmpPath).metadata();
          if (!checkLease()) throw new Error("Lease lost");
          width = metadata.width || null;
          height = metadata.height || null;
          if (metadata.orientation && metadata.orientation >= 5) {
            width = metadata.height || null;
            height = metadata.width || null;
          }
        }

        if (!checkLease()) throw new Error("Lease lost");
        db.prepare(`
          INSERT INTO gallery_media (id, gallery_id, type, visibility, original_name, mime_type, size, hash, width, height, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(mediaId, galleryId, type, file.visibility, file.name, mimeType, stat.size, finalHash, width, height, Date.now());
        inserted = true;

        if (!checkLease()) throw new Error("Lease lost");
        fs.renameSync(tmpPath, destPath);
        tmpPath = null;

        currentTotalSize += stat.size;
        results.imported++;
      } catch (err) {
        if (inserted && tmpPath) {
           // Compensation: if rename fails but DB was inserted, remove DB record to keep consistency
           try {
             db.prepare("DELETE FROM gallery_media WHERE id = ?").run(destPath ? path.basename(destPath) : "");
           } catch { /* ignore */ }
        }
        results.ignored.push({ file: file.name, reason: "Erreur: " + (err instanceof Error ? err.message : String(err)) });
      } finally {
        if (fd !== null) {
          try { fs.closeSync(fd); } catch { /* ignore */ }
        }
        if (tmpPath && fs.existsSync(tmpPath)) {
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }
        progress++;
        if (checkLease()) {
          db.prepare("UPDATE gallery_imports SET progress = ?, updated_at = ? WHERE id = ? AND worker_id = ?").run(progress, Date.now(), importId, leaseToken);
        }
      }
    }

    if (leaseTimer) clearInterval(leaseTimer);

    // Finalize
    if (!canceled) {
      db.prepare("UPDATE gallery_imports SET status = 'completed', result_json = ?, updated_at = ? WHERE id = ? AND worker_id = ?")
      .run(JSON.stringify(results), Date.now(), importId, leaseToken);
    }

  } catch (err) {
    if (leaseTimer) clearInterval(leaseTimer);
    if (!canceled) {
      db.prepare("UPDATE gallery_imports SET status = 'failed', result_json = ?, updated_at = ? WHERE id = ? AND worker_id = ?")
      .run(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), Date.now(), importId, leaseToken);
    }
  }
}
