const fs = require('fs');
const path = require('path');

let target = path.join(__dirname, 'apps/web/app/lib/gallery-import.server.ts');
let content = fs.readFileSync(target, 'utf-8');
content = content.replace(/return \{ id: result\.id, gallery_id: result\.gallery_id, import_path: gallery\.import_path \};/g, 
  `return { id: result.id, gallery_id: result.gallery_id, import_path: gallery.import_path, lease_token: leaseToken };`);
fs.writeFileSync(target, content);

target = path.join(__dirname, 'apps/web/e2e/client-gallery.spec.ts');
content = fs.readFileSync(target, 'utf-8');
content = content.replace(/const coupleMediaId = adminPhotos\.find\(\(p: Record<string, unknown>\) => p\.visibility === "maries"\)\.id;/g,
  `const coupleMediaId = adminPhotos.find((p: Record<string, unknown>) => p.visibility === "maries")!.id;`);
content = content.replace(/const guestMediaId = adminPhotos\.find\(\(p: Record<string, unknown>\) => p\.original_name === "guest-photo-1\.jpg"\)\.id;/g,
  `const guestMediaId = adminPhotos.find((p: Record<string, unknown>) => p.original_name === "guest-photo-1.jpg")!.id;`);
fs.writeFileSync(target, content);
console.log("Fixed TS errors");
