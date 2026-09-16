const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/e2e/client-gallery.spec.ts');
let content = fs.readFileSync(target, 'utf-8');

content = content.replace(/Enregistrer les modifications/g, `Enregistrer les informations`);

fs.writeFileSync(target, content);
console.log("Fixed e2e leftovers 2");
