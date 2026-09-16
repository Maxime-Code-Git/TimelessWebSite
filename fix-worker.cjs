const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/app/lib/gallery-import.server.ts');
let content = fs.readFileSync(target, 'utf-8');

// Injectable lease duration
content = content.replace(/const LEASE_DURATION_MS = 30000;/, 
`let LEASE_DURATION_MS = 30000;
export function __setLeaseDurationForTest(ms: number) { LEASE_DURATION_MS = ms; }`);

// Disable auto start
content = content.replace(/scheduleWorker\(\);/g, 
`if (!process.env.__TEST_DISABLE_WORKER) scheduleWorker();`);

fs.writeFileSync(target, content);
console.log("Fixed worker server");
