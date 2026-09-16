const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/routes/api.gallery.$publicId.media.$mediaId.ts');
let content = fs.readFileSync(filePath, 'utf-8');

content = content.replace(/let targetWidth = 1920;/, 'const formatParam = url.searchParams.get("format");\n  let targetWidth = 1920;');
content = content.replace(/if \(formatParam === "avif"/, 'if (targetFormat === "avif"');
content = content.replace(/!formatParam && accept/g, '!targetFormat && accept');
content = content.replace(/else if \(formatParam === "webp"/, 'else if (targetFormat === "webp"');

fs.writeFileSync(filePath, content);

const testPath = path.join(__dirname, 'tests/admin-gallery-integration.server.test.ts');
let testContent = fs.readFileSync(testPath, 'utf-8');
testContent = testContent.replace(/const db = new Database\(galleryDbPath\);/, 'const Database = require("better-sqlite3");\n    const db = new Database(galleryDbPath);');
fs.writeFileSync(testPath, testContent);

console.log("Fixed typescript errors");
