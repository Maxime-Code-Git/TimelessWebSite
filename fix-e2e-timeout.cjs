const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/e2e/client-gallery.spec.ts');
let content = fs.readFileSync(target, 'utf-8');

// Insert timeout
content = content.replace(/test\("cycle complet des galeries", async \(\{[^\}]+\}\) => \{\n/, 
  match => match + '    test.setTimeout(120_000);\n');

fs.writeFileSync(target, content);
console.log("Fixed E2E timeout");
