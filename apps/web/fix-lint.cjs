const fs = require('fs');
const path = require('path');

const origPath = path.join(__dirname, 'app/routes/api.gallery.$publicId.download.original.$mediaId.ts');
let origContent = fs.readFileSync(origPath, 'utf-8');
origContent = origContent.replace(/\\\/\\\\"/g, '/\\\\\"');
origContent = origContent.replace(/\\\/\\\\\\\\/g, '/\\\\\\\\');
fs.writeFileSync(origPath, origContent);

const mediaPath = path.join(__dirname, 'app/routes/api.gallery.$publicId.media.$mediaId.ts');
let mediaContent = fs.readFileSync(mediaPath, 'utf-8');
mediaContent = mediaContent.replace(/const VALID_WIDTHS = \[.*?\];\n/, '');
mediaContent = mediaContent.replace(/catch \(_err\)/g, 'catch');
mediaContent = mediaContent.replace(/let targetFormat: "jpeg" \| "webp" \| "avif" \| null = null;/, 'let targetFormat: "jpeg" | "webp" | "avif" | null;');
fs.writeFileSync(mediaPath, mediaContent);

const testPath = path.join(__dirname, 'tests/admin-gallery-integration.server.test.ts');
let testContent = fs.readFileSync(testPath, 'utf-8');
testContent = testContent.replace(/requireModule\.resolve/g, '/* eslint-disable-next-line @typescript-eslint/no-require-imports */\n  requireModule.resolve');
testContent = testContent.replace(/SEMPRA\\\-/g, 'SEMPRA-');
fs.writeFileSync(testPath, testContent);

console.log("Linting manually fixed");
