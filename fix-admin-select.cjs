const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/app/routes/admin.galleries.$id.tsx');
let content = fs.readFileSync(target, 'utf-8');

content = content.replace(/<label className=\{styles\.label\}>Dossier d'import<\/label>\n\s+<select/, 
  `<label className={styles.label} htmlFor="import_folder">Dossier d'import</label>\n          <select id="import_folder"`);

fs.writeFileSync(target, content);
console.log("Fixed select id");
