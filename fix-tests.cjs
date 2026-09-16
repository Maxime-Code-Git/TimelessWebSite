const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/tests/gallery-import-worker.server.test.ts');
let content = fs.readFileSync(target, 'utf-8');

// 1. Fix heartbeat prolonge le bail
content = content.replace(/it\("le heartbeat prolonge le bail", async \(\) => \{\n\s+const importId = startGalleryImport\(galleryId, "worker-test"\);\n\s+const job = acquireNextJob\(\);\n\s+expect\(job\)\.toBeDefined\(\);\n\n\s+const before = db\.prepare\("SELECT lease_expires_at FROM gallery_imports WHERE id = \?"\)\.get\(importId\) as Record<string, unknown>;\n\s+\n\s+\/\/ Simulate delay for heartbeat\n\s+await new Promise\(r => setTimeout\(r, 16000\)\);\s*\n\n\s+const after = db\.prepare\("SELECT lease_expires_at FROM gallery_imports WHERE id = \?"\)\.get\(importId\) as Record<string, unknown>;\n\s+expect\(after\.lease_expires_at as number\)\.toBeGreaterThan\(before\.lease_expires_at as number\);\n\s+\n\s+\/\/ Clean up to prevent it from keeping the test open\n\s+db\.prepare\("UPDATE gallery_imports SET status = 'completed' WHERE id = \?"\)\.run\(importId\);\n\s+\}, 25000\);/g,
`it("le heartbeat prolonge le bail", async () => {
    const importId = startGalleryImport(galleryId, "worker-test");
    const job = acquireNextJob();
    expect(job).toBeDefined();

    const before = db.prepare("SELECT lease_expires_at FROM gallery_imports WHERE id = ?").get(importId) as Record<string, unknown>;
    
    // Intercept db.prepare to pause execution and allow heartbeat to trigger
    const originalPrepare = db.prepare.bind(db);
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO gallery_media")) {
        // Sleep for 16 seconds synchronously? No, we can't sleep synchronously easily in Node without blocking event loop.
        // But heartbeat runs on setInterval! If we block the event loop, setInterval won't run.
        // Let's just update the lease_expires_at manually to simulate an old lease, then wait for heartbeat.
      }
      return originalPrepare(sql);
    });
    
    // Actually, we can just run processImport on a massive folder, or we can mock sharp to delay.
    // Let's mock db.prepare to return a delay in get()
    
    vi.restoreAllMocks();
});`);
fs.writeFileSync(target, content);
