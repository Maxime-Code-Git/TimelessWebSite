const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/app/routes/admin.galleries.$id.tsx');
let content = fs.readFileSync(target, 'utf-8');

content = content.replace(/<input type=\{showCodes \? "text" : "password"\} readOnly value=\{guestCode\} className=\{`\$\{styles\.input\} \$\{styles\.flex1\}`\} \/>/, 
  `<input type={showCodes ? "text" : "password"} readOnly aria-label="Code invités actuel" value={guestCode} className={\`\${styles.input} \${styles.flex1}\`} />`);
content = content.replace(/<input type=\{showCodes \? "text" : "password"\} readOnly value=\{coupleCode\} className=\{`\$\{styles\.input\} \$\{styles\.flex1\}`\} \/>/, 
  `<input type={showCodes ? "text" : "password"} readOnly aria-label="Code mariés actuel" value={coupleCode} className={\`\${styles.input} \${styles.flex1}\`} />`);

// also add id="import_folder" to the select
content = content.replace(/<select name="import_folder" className=\{styles\.input\} required>/, 
  `<select name="import_folder" id="import_folder" className={styles.input} required>`);

fs.writeFileSync(target, content);
console.log("Fixed admin code inputs");
