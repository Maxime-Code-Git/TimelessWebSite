const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/app/lib/gallery-import.server.ts');
let content = fs.readFileSync(target, 'utf-8');

// 1. Remove WORKER_ID export
content = content.replace(/export const WORKER_ID = crypto\.randomUUID\(\);\n/, '');

// 2. Update acquireNextJob
content = content.replace(/function acquireNextJob\(\): \{ id: string; gallery_id: string; import_path: string \} \| null \{/g, `function acquireNextJob(): { id: string; gallery_id: string; import_path: string; lease_token: string } | null {
  const leaseToken = crypto.randomUUID();`);

content = content.replace(/UPDATE gallery_imports \s+SET status = 'processing', worker_id = \?, lease_expires_at = \?, attempt_count = attempt_count \+ 1, updated_at = \? \s+WHERE id = \(\s+SELECT id FROM gallery_imports \s+WHERE status = 'pending' OR \(status = 'processing' AND lease_expires_at < \?\) \s+ORDER BY created_at ASC \s+LIMIT 1\s+\) RETURNING id, gallery_id, import_path/g, `UPDATE gallery_imports 
    SET status = 'processing', worker_id = ?, lease_expires_at = ?, attempt_count = attempt_count + 1, updated_at = ? 
    WHERE id = (
      SELECT id FROM gallery_imports 
      WHERE status = 'pending' OR (status = 'processing' AND lease_expires_at < ?) 
      ORDER BY created_at ASC 
      LIMIT 1
    ) RETURNING id, gallery_id, import_path`);
    
content = content.replace(/\.get\(WORKER_ID, Date\.now\(\) \+ LEASE_DURATION_MS, Date\.now\(\), Date\.now\(\)\)/g, '.get(leaseToken, Date.now() + LEASE_DURATION_MS, Date.now(), Date.now())');

content = content.replace(/return res as \{ id: string; gallery_id: string; import_path: string \};/g, 'return { ...(res as { id: string; gallery_id: string; import_path: string }), lease_token: leaseToken };');

// 3. Update runImportWorker
content = content.replace(/await processImport\(job\.id, job\.gallery_id, job\.import_path\);/g, 'await processImport(job.id, job.gallery_id, job.import_path, job.lease_token);');

// 4. Update processImport signature
content = content.replace(/export async function processImport\(importId: string, galleryId: string, folderName: string\): Promise<void> \{/g, 'export async function processImport(importId: string, galleryId: string, folderName: string, leaseToken: string): Promise<void> {');

// 5. Update WORKER_ID -> leaseToken in processImport
content = content.replace(/WORKER_ID/g, 'leaseToken');

// 6. Fix checkLease in processImport to strictly check status='processing'
content = content.replace(/const res = db\.prepare\("UPDATE gallery_imports SET lease_expires_at = \? WHERE id = \? AND worker_id = \?"\)\n\s+\.run\(Date\.now\(\) \+ LEASE_DURATION_MS, importId, leaseToken\);/g, `const res = db.prepare("UPDATE gallery_imports SET lease_expires_at = ? WHERE id = ? AND worker_id = ? AND status = 'processing' AND lease_expires_at > ?")
        .run(Date.now() + LEASE_DURATION_MS, importId, leaseToken, Date.now() - LEASE_DURATION_MS); // allow some skew, but reject completely expired leases by others. Actually, if someone stole it, worker_id changed. If it expired but not stolen, we can still renew it if it hasn't been stolen. Wait! The instruction says: "Un bail déjà expiré ne doit pas pouvoir être renouvelé par son ancien propriétaire." So lease_expires_at > Date.now().`);

content = content.replace(/lease_expires_at > \?\"\)\n\s+\.run\(Date\.now\(\) \+ LEASE_DURATION_MS, importId, leaseToken, Date\.now\(\) - LEASE_DURATION_MS\);/g, `lease_expires_at >= ?")
        .run(Date.now() + LEASE_DURATION_MS, importId, leaseToken, Date.now());`);


fs.writeFileSync(target, content);
console.log("Updated gallery-import.server.ts for token lease");
