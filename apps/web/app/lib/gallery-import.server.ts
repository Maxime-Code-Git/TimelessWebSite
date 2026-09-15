import * as fs from "node:fs";
import * as path from "node:path";
import crypto from "node:crypto";
import { ENV } from "./env.server";
import { getGalleryDb } from "./gallery-db.server";
import sharp from "sharp";

export function getAvailableImportFolders(): string[] {
  const importDir = ENV.GALLERY_IMPORT_PATH;
  if (!fs.existsSync(importDir)) return [];
  const entries = fs.readdirSync(importDir, { withFileTypes: true });
  return entries.filter(e => e.isDirectory()).map(e => e.name);
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

interface FileToProcess {
  fullPath: string;
  name: string;
  visibility: "invites" | "maries";
}

function scanFolderForFiles(basePath: string, subFolder: string, visibility: "invites" | "maries", rejected: {file: string, reason: string}[] = []): FileToProcess[] {
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
        // Skip hidden files
        if (!entry.name.startsWith(".")) {
          files.push({ fullPath, name: entry.name, visibility });
        }
      }
    }
  };
  scan(targetDir);
  return files;
}

export async function getImportPreview(folderName: string) {
  const baseReal = fs.realpathSync(ENV.GALLERY_IMPORT_PATH);
  const importDir = fs.realpathSync(path.resolve(ENV.GALLERY_IMPORT_PATH, folderName));

  if (!importDir.startsWith(baseReal)) {
    throw new Error("Invalid import path");
  }

  const rejected: {file: string, reason: string}[] = [];

  const invitesFiles = [
    ...scanFolderForFiles(importDir, "invites/photos", "invites", rejected),
    ...scanFolderForFiles(importDir, "invites/videos", "invites", rejected)
  ];
  const mariesFiles = [
    ...scanFolderForFiles(importDir, "maries/photos", "maries", rejected),
    ...scanFolderForFiles(importDir, "maries/videos", "maries", rejected)
  ];

  let validInvitesPhotos = 0;
  let validInvitesVideos = 0;
  let validMariesPhotos = 0;
  let validMariesVideos = 0;

  const checkMime = (file: FileToProcess, isInvites: boolean) => {
    try {
      const fd = fs.openSync(file.fullPath, "r");
      const header = Buffer.alloc(1024);
      const bytesRead = fs.readSync(fd, header, 0, 1024, 0);
      fs.closeSync(fd);
      const mimeType = detectMimeType(header.subarray(0, bytesRead));
      if (!mimeType) {
        rejected.push({ file: file.name, reason: "Format non supporté ou inconnu" });
        return;
      }
      if (isInvites) {
        if (mimeType.startsWith("image/")) validInvitesPhotos++;
        else validInvitesVideos++;
      } else {
        if (mimeType.startsWith("image/")) validMariesPhotos++;
        else validMariesVideos++;
      }
    } catch {
      rejected.push({ file: file.name, reason: "Erreur de lecture" });
    }
  };

  for (const f of invitesFiles) checkMime(f, true);
  for (const f of mariesFiles) checkMime(f, false);

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



export function startGalleryImport(galleryId: string, folderName: string) {
  const db = getGalleryDb();

  // Update import path on gallery
  db.prepare("UPDATE galleries SET import_path = ? WHERE id = ?").run(folderName, galleryId);

  const importId = crypto.randomUUID();
  const now = Date.now();

  db.prepare("INSERT INTO gallery_imports (id, gallery_id, status, progress, total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(importId, galleryId, "pending", 0, 0, now, now);

  // Start background process
  void processImport(importId, galleryId, folderName).catch(err => {
    console.error("Import failed:", err);
  });

  return importId;
}

export function resumeImports() {
  const db = getGalleryDb();

  // Atomic lock for resuming imports using an IMMEDIATE transaction
  db.exec("BEGIN IMMEDIATE");
  let pending: any[] = [];
  try {
    pending = db.prepare("SELECT gi.id, gi.gallery_id, g.import_path FROM gallery_imports gi JOIN galleries g ON gi.gallery_id = g.id WHERE gi.status IN ('pending', 'processing')").all();
    for (const p of pending) {
      db.prepare("UPDATE gallery_imports SET status = 'processing' WHERE id = ?").run(p.id);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("Failed to acquire atomic lock for imports", err);
    return;
  }

  for (const p of pending) {
    if (p.import_path) {
      void processImport(p.id, p.gallery_id, p.import_path).catch(err => console.error("Resume failed:", err));
    }
  }
}

async function processImport(importId: string, galleryId: string, folderName: string) {
  const db = getGalleryDb();

  try {
    const baseReal = fs.realpathSync(ENV.GALLERY_IMPORT_PATH);
    const importDir = fs.realpathSync(path.resolve(ENV.GALLERY_IMPORT_PATH, folderName));

    if (!importDir.startsWith(baseReal)) {
      throw new Error("Invalid import path");
    }

    const ignoredFiles: {file: string, reason: string}[] = [];
    const files = [
      ...scanFolderForFiles(importDir, "invites/photos", "invites", ignoredFiles),
      ...scanFolderForFiles(importDir, "invites/videos", "invites", ignoredFiles),
      ...scanFolderForFiles(importDir, "maries/photos", "maries", ignoredFiles),
      ...scanFolderForFiles(importDir, "maries/videos", "maries", ignoredFiles)
    ];

    if (files.length > 1000) {
      throw new Error("La galerie dépasse la limite de 1000 médias.");
    }

    db.prepare("UPDATE gallery_imports SET status = 'processing', total = ?, updated_at = ? WHERE id = ?")
      .run(files.length, Date.now(), importId);

    const mediaDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId);
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    } else {
      // Cleanup orphans .tmp files from previous crashed runs
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
        const stat = fs.statSync(file.fullPath);
        const fd = fs.openSync(file.fullPath, "r");
        const header = Buffer.alloc(1024);
        const bytesRead = fs.readSync(fd, header, 0, 1024, 0);
        fs.closeSync(fd);

        const mimeType = detectMimeType(header.subarray(0, bytesRead));
        if (!mimeType) {
          results.ignored.push({ file: file.name, reason: "Format non supporté ou inconnu" });
          continue;
        }

        const type = mimeType.startsWith("image/") ? "photo" : "video";

        // Calculate SHA-256
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

        let width = null;
        let height = null;
        if (type === "photo") {
          const metadata = await sharp(file.fullPath).metadata();
          width = metadata.width || null;
          height = metadata.height || null;
          // respect EXIF orientation swap
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
      } catch (err) {
        results.ignored.push({ file: file.name, reason: "Erreur de lecture: " + (err instanceof Error ? err.message : String(err)) });
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
