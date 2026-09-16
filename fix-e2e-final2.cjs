const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/e2e/client-gallery.spec.ts');
let content = fs.readFileSync(target, 'utf-8');

// 1. Remove if (heading > 0)
content = content.replace(/const heading = await adminPage\.locator\('h2:has-text\("Admin"\)'\)\.count\(\);\n\s*if \(heading > 0\) \{[\s\S]*?\}\n/, '');

// 2. Fix input[name="guestCode"]
content = content.replace(/const guestCode = await adminPage\.locator\('input\[name="guestCode"\]'\)\.inputValue\(\);/, 'const guestCode = await adminPage.getByLabel("Code invités actuel").inputValue();');

// 3. Fix select[name="import_folder"]
content = content.replace(/await adminPage\.selectOption\('select\[name="import_folder"\]', IMPORT_FOLDER\);/, 'await adminPage.getByLabel("Dossier d\'import").selectOption(IMPORT_FOLDER);');

// 4. Fix data.status, data.stats
content = content.replace(/const res = await adminContext\.request\.get\(`\/api\/admin\/gallery-import\/\$\{importId\}`\);\n\s*const data = await res\.json\(\);\n\n\s*if \(data\.status === "completed"\) \{[\s\S]*?break;\n\s*\}/, 
`const res = await adminContext.request.get(\`/api/admin/gallery-import/\${importId}\`);
      const data = await res.json();
      const importState = data.importState;

      if (importState.status === "completed") {
        expect(importState.progress).toBe(28);
        expect(importState.total).toBe(28);
        const result = JSON.parse(importState.result_json);
        expect(result.imported).toBe(28);
        expect(result.ignored).toHaveLength(0);
        break;
      }`);

fs.writeFileSync(target, content);
console.log("Fixed E2E spec final 2");
