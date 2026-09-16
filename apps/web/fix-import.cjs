const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/lib/gallery-import.server.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace acquireNextJob, scheduleWorker, runWorkerLoop, processImport, etc.

content = content.replace(/function acquireNextJob[\s\S]*?(?=export function resumeImports)/, `const WORKER_ID = crypto.randomUUID();
const LEASE_DURATION_MS = 30000;

function acquireNextJob(): { id: string; gallery_id: string; import_path: string } | null {
  const db = getGalleryDb();
  const now = Date.now();

  const pending = db.prepare(
    "SELECT gi.id, gi.gallery_id, g.import_path FROM gallery_imports gi JOIN galleries g ON gi.gallery_id = g.id WHERE gi.status = 'pending' OR (gi.status = 'processing' AND gi.lease_expires_at < ?) ORDER BY gi.created_at ASC LIMIT 1"
  ).get(now) as { id: string; gallery_id: string; import_path: string } | undefined;

  if (!pending) return null;

  const expiresAt = now + LEASE_DURATION_MS;
  const result = db.prepare(
    "UPDATE gallery_imports SET status = 'processing', worker_id = ?, lease_expires_at = ?, attempt_count = attempt_count + 1, updated_at = ? WHERE id = ? AND (status = 'pending' OR (status = 'processing' AND lease_expires_at < ?))"
  ).run(WORKER_ID, expiresAt, now, pending.id, now);

  if (result.changes !== 1) return null;

  return pending;
}

`);

content = content.replace(/export function resumeImports[\s\S]*?(?=async function processImport)/, `export function resumeImports(): void {
  if (workerStarted) return;
  workerStarted = true;
  scheduleWorker();
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
      await processImport(job.id, job.gallery_id, job.import_path);
    }
    job = acquireNextJob();
  }
}

`);

const newProcessImport = `async function processImport(importId: string, galleryId: string, folderName: string): Promise<void> {
  const db = getGalleryDb();
  let leaseTimer: NodeJS.Timeout | null = null;

  try {
    const importDir = validateImportPath(folderName);
    const ignoredFiles: RejectedFile[] = [];
    const files = collectFiles(importDir, ignoredFiles);

    if (files.length > MAX_MEDIA_COUNT) {
      throw new Error(\`La galerie dépasse la limite de \${MAX_MEDIA_COUNT} médias.\`);
    }

    db.prepare("UPDATE gallery_imports SET total = ?, updated_at = ? WHERE id = ? AND worker_id = ?")
      .run(files.length, Date.now(), importId, WORKER_ID);

    leaseTimer = setInterval(() => {
      db.prepare("UPDATE gallery_imports SET lease_expires_at = ? WHERE id = ? AND worker_id = ?")
        .run(Date.now() + LEASE_DURATION_MS, importId, WORKER_ID);
    }, LEASE_DURATION_MS / 2);

    const mediaDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId);
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    } else {
      const existingFiles = fs.readdirSync(mediaDir);
      for (const f of existingFiles) {
        if (f.endsWith(".tmp")) {
          try { fs.unlinkSync(path.join(mediaDir, f)); } catch { /* ignore */ }
        }
      }
    }

    let progress = 0;
    const results = { imported: 0, ignored: [...ignoredFiles] };
    let currentTotalSize = 0;

    for (const file of files) {
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
          width = metadata.width || null;
          height = metadata.height || null;
          if (metadata.orientation && metadata.orientation >= 5) {
            width = metadata.height || null;
            height = metadata.width || null;
          }
        }

        db.prepare(\`
          INSERT INTO gallery_media (id, gallery_id, type, visibility, original_name, mime_type, size, hash, width, height, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        \`).run(mediaId, galleryId, type, file.visibility, file.name, mimeType, stat.size, finalHash, width, height, Date.now());
        inserted = true;

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
        db.prepare("UPDATE gallery_imports SET progress = ?, updated_at = ? WHERE id = ? AND worker_id = ?").run(progress, Date.now(), importId, WORKER_ID);
      }
    }

    if (leaseTimer) clearInterval(leaseTimer);
    
    // Finalize
    db.prepare("UPDATE gallery_imports SET status = 'completed', result_json = ?, updated_at = ? WHERE id = ? AND worker_id = ?")
      .run(JSON.stringify(results), Date.now(), importId, WORKER_ID);

  } catch (err) {
    if (leaseTimer) clearInterval(leaseTimer);
    db.prepare("UPDATE gallery_imports SET status = 'failed', result_json = ?, updated_at = ? WHERE id = ? AND worker_id = ?")
      .run(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), Date.now(), importId, WORKER_ID);
  }
}
`;

content = content.replace(/async function processImport[\s\S]*$/, newProcessImport);
fs.writeFileSync(filePath, content);
console.log("Updated gallery-import.server.ts");
