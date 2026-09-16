const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/e2e/client-gallery.spec.ts');
let content = fs.readFileSync(target, 'utf-8');

const addFixtureDir = `
const fixtureDirectory = fileURLToPath(new URL(".", import.meta.url));
`;
content = content.replace(/const IMPORT_FOLDER = "e2e-playwright-import";/, addFixtureDir + '\nconst IMPORT_FOLDER = "e2e-playwright-import";');

fs.writeFileSync(target, content);
console.log("Fixed E2E ESM issue");
