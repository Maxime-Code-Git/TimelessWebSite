const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/routes/api.gallery.$publicId.download.ts');
let content = fs.readFileSync(filePath, 'utf-8');

const newZipLogic = `
  const filesToAdd: { filePath: string; safeName: string }[] = [];
  const usedNames = new Set<string>();

  for (const m of media) {
    const filePath = path.join(ENV.GALLERY_MEDIA_PATH, String(gallery.id), String(m.id));
    if (fs.existsSync(filePath)) {
      let rawName = m.original_name ? String(m.original_name) : "media";
      let safeName = path.basename(rawName).replace(/[\\r\\n]/g, "").replace(/[^\\x20-\\x7E]/g, "_").replace(/"/g, '');

      if (usedNames.has(safeName)) {
        const ext = path.extname(safeName);
        const name = path.basename(safeName, ext);
        let i = 1;
        while (usedNames.has(\`\${name}-\${i}\${ext}\`)) i++;
        safeName = \`\${name}-\${i}\${ext}\`;
      }
      usedNames.add(safeName);
      filesToAdd.push({ filePath, safeName });
    }
  }

  if (filesToAdd.length === 0) {
    return new Response("No valid files to download", { status: 404, headers: GALLERY_PRIVATE_HEADERS });
  }

  const zipfile = new yazl.ZipFile();
  const zipFileName = \`Sempra-\${String(gallery.bride_names).replace(/[^a-zA-Z0-9-]/g, "_")}.zip\`;

  for (const f of filesToAdd) {
    zipfile.addFile(f.filePath, f.safeName);
  }

  zipfile.end();
`;

content = content.replace(/const zipfile = new yazl\.ZipFile\(\);[\s\S]*?(?=\/\/ Wrap in Node\.js Readable)/, newZipLogic);
fs.writeFileSync(filePath, content);
console.log("Updated zip route");
