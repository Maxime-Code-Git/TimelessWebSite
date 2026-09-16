const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/app/lib/gallery-import.server.ts');
let content = fs.readFileSync(target, 'utf-8');

const oldReconciliation = `    // RECONCILIATION
    const existingFiles = fs.readdirSync(mediaDir);
    const tmpFiles = existingFiles.filter(f => f.endsWith(".tmp"));
    const finalFiles = existingFiles.filter(f => !f.endsWith(".tmp"));

    // 1. Check tmp files: if DB has them, recover by renaming. Else, delete.
    for (const tmp of tmpFiles) {
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
      const existsInDb = db.prepare("SELECT id FROM gallery_media WHERE id = ?").get(f);
      if (!existsInDb) {
        try { fs.unlinkSync(path.join(mediaDir, f)); } catch { /* ignore */ }
      }
    }

    // 3. Check phantom DB records for this gallery: if file missing, delete record.
    const dbRecords = db.prepare("SELECT id FROM gallery_media WHERE gallery_id = ?").all(galleryId) as { id: string }[];
    for (const rec of dbRecords) {
      if (!fs.existsSync(path.join(mediaDir, rec.id))) {
        db.prepare("DELETE FROM gallery_media WHERE id = ?").run(rec.id);
      }
    }`;

const newReconciliation = `    if (!checkLease()) throw new Error("Lease lost before reconciliation");
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
    }`;

content = content.replace(oldReconciliation, newReconciliation);
fs.writeFileSync(target, content);
console.log("Updated reconciliation lease checks");
