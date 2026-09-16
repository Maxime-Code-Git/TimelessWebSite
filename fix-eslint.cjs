const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/tests/gallery-import-worker.server.test.ts');
let content = fs.readFileSync(target, 'utf-8');

content = content.replace(/import crypto from "node:crypto";\n/, '');
content = content.replace(/const WORKER_LEASE_MS = 30000;\n/, '');
content = content.replace(/const fsOriginal = vi\.importActual\("node:fs"\);\n/g, '');

fs.writeFileSync(target, content);
console.log("Fixed ESLint errors");
