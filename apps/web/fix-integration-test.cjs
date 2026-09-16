const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'tests/admin-gallery-integration.server.test.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace execSync sqlite3 with better-sqlite3
content = content.replace(/import \{ execSync \} from "node:child_process";/, 'import { execSync } from "node:child_process";\nimport Database from "better-sqlite3";');

const oldSqlite = /execSync\(\`sqlite3 \$\{galleryDbPath\} "UPDATE galleries SET expires_at = \$\{Date\.now\(\) - 86400000\} WHERE id = '\$\{galleryId\}'"\`\);/;
const newSqlite = `
    const db = new Database(galleryDbPath);
    db.prepare("UPDATE galleries SET expires_at = ? WHERE id = ?").run(Date.now() - 86400000, galleryId);
    db.close();
`;
content = content.replace(oldSqlite, newSqlite);

// Replace fixed port 43213 with random port
content = content.replace(/const PORT = 43213;/, 'const PORT = Math.floor(Math.random() * 20000) + 40000;');

// Fix date format in wedding_date form payload
content = content.replace(/"15 Juillet 2026"/, '"2026-07-15"');

// Remove console.logs that write cookies
content = content.replace(/console\.log\("loginLoc:", loginLoc\);/g, '');
content = content.replace(/console\.log\("newRes status:", newRes\.status\);/g, '');
content = content.replace(/console\.log\("createRes status:", createRes\.status\);/g, '');

// Fix zip assertions
const zipAssertionsOld = `
    // Verify ZIP download API works for couples
    const zipRes = await fetch(\`\${BASE_URL}/api/gallery/\${public_id}/download?type=all\`, {
      headers: { "Cookie": coupleCookie! }
    });
    // It might return a redirect or a ZIP stream depending on the implementation
    expect([200, 302, 303]).toContain(zipRes.status);
`;
const zipAssertionsNew = `
    // Verify ZIP download API works for couples
    const zipRes = await fetch(\`\${BASE_URL}/api/gallery/\${public_id}/download?type=all\`, {
      headers: { "Cookie": coupleCookie! }
    });
    expect(zipRes.status).toBe(200);
    expect(zipRes.headers.get("Content-Type")).toBe("application/zip");
    
    const zipBuffer = await zipRes.arrayBuffer();
    expect(zipBuffer.byteLength).toBeGreaterThan(100);
`;
content = content.replace(zipAssertionsOld, zipAssertionsNew);

fs.writeFileSync(filePath, content);
console.log("Updated integration test");
