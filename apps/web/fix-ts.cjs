const fs = require('fs');
const path = require('path');

// 1. targetFormat missing in api.gallery.$publicId.media.$mediaId.ts
const mediaPath = path.join(__dirname, 'app/routes/api.gallery.$publicId.media.$mediaId.ts');
let mediaContent = fs.readFileSync(mediaPath, 'utf-8');
mediaContent = mediaContent.replace(/const formatParam = url.searchParams.get\("format"\);\n  let targetWidth = 1920;/, 'const formatParam = url.searchParams.get("format");\n  let targetWidth = 1920;\n  let targetFormat: "jpeg" | "webp" | "avif" | null = null;');
fs.writeFileSync(mediaPath, mediaContent);

// 2. Playwright unused fixtures
const e2ePath = path.join(__dirname, 'e2e/client-gallery.spec.ts');
let e2eContent = fs.readFileSync(e2ePath, 'utf-8');
e2eContent = e2eContent.replace(/async \(\{ _page, _context \}\) => \{/g, 'async () => {');
fs.writeFileSync(e2ePath, e2eContent);

// 3. Database import in integration test
const testPath = path.join(__dirname, 'tests/admin-gallery-integration.server.test.ts');
let testContent = fs.readFileSync(testPath, 'utf-8');
if (!testContent.includes('import Database from "better-sqlite3";')) {
  testContent = testContent.replace(/import \{ execSync \} from "node:child_process";/, 'import { execSync } from "node:child_process";\nimport Database from "better-sqlite3";');
}
fs.writeFileSync(testPath, testContent);

console.log("Fixed typings");
