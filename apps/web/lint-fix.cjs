const fs = require('fs');
const path = require('path');

// 1. api.gallery.$publicId.download.original.$mediaId.ts
const origPath = path.join(__dirname, 'app/routes/api.gallery.$publicId.download.original.$mediaId.ts');
let origContent = fs.readFileSync(origPath, 'utf-8');
origContent = origContent.replace(/\/\\[\\\\r\\\\n\\\\\/\\\\\\\\\\]\/g/, '/[\\\\r\\\\n/\\\\\\\\"]/g');
origContent = origContent.replace(/\[\\\\\/\\\\\\\\\]\/g/, '[/\\\\\\\\]/g');
fs.writeFileSync(origPath, origContent);

// 2. api.gallery.$publicId.download.ts
const dlPath = path.join(__dirname, 'app/routes/api.gallery.$publicId.download.ts');
let dlContent = fs.readFileSync(dlPath, 'utf-8');
dlContent = dlContent.replace(/let rawName =/g, 'const rawName =');
fs.writeFileSync(dlPath, dlContent);

// 3. api.gallery.$publicId.media.$mediaId.ts
const mediaPath = path.join(__dirname, 'app/routes/api.gallery.$publicId.media.$mediaId.ts');
let mediaContent = fs.readFileSync(mediaPath, 'utf-8');
mediaContent = mediaContent.replace(/const VALID_WIDTHS = \[.*?\];/g, '');
mediaContent = mediaContent.replace(/catch \(err\)/g, 'catch (_err)');
// fix the format code we mangled earlier
mediaContent = mediaContent.replace(/let targetFormat: "jpeg" \| "webp" \| "avif" \| null = null;/, '');
fs.writeFileSync(mediaPath, mediaContent);

// 4. e2e/client-gallery.spec.ts
const e2ePath = path.join(__dirname, 'e2e/client-gallery.spec.ts');
let e2eContent = fs.readFileSync(e2ePath, 'utf-8');
e2eContent = e2eContent.replace(/import crypto from "node:crypto";\n/g, '');
e2eContent = e2eContent.replace(/\(p: any\)/g, '(p: { visibility: string })');
e2eContent = e2eContent.replace(/async \({ page, context }\) => \{/g, 'async ({ _page, _context }) => {');
e2eContent = e2eContent.replace(/_page: any/g, 'page: any'); // Just in case, let's fix manually for specific tests
fs.writeFileSync(e2ePath, e2eContent);

// 5. tests/admin-gallery-integration.server.test.ts
const testPath = path.join(__dirname, 'tests/admin-gallery-integration.server.test.ts');
let testContent = fs.readFileSync(testPath, 'utf-8');
testContent = testContent.replace(/const Database = require\("better-sqlite3"\);\n/g, '');
if (!testContent.includes('import Database from "better-sqlite3";')) {
  testContent = testContent.replace(/import \{ execSync \} from "node:child_process";/, 'import { execSync } from "node:child_process";\nimport Database from "better-sqlite3";');
}
testContent = testContent.replace(/const loginLoc = loginRes.headers.get\("Location"\) \|\| "";\n/g, '');
testContent = testContent.replace(/const updateText = await updateRes.text\(\);\n/g, '');
testContent = testContent.replace(/SEMPRA\\\-/g, 'SEMPRA-');
fs.writeFileSync(testPath, testContent);

console.log("Linting fixed");
