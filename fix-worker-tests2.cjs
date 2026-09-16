const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/tests/gallery-import-worker.server.test.ts');
let content = fs.readFileSync(target, 'utf-8');

content = content.replace(/import \{ startGalleryImport, processImport, acquireNextJob \} from "~\/lib\/gallery-import\.server";/,
`import { startGalleryImport, processImport, acquireNextJob, __setLeaseDurationForTest } from "~/lib/gallery-import.server";
import { Readable } from "node:stream";`);

content = content.replace(/describe\("Gallery Import Worker Logic", \(\) => \{/,
`describe("Gallery Import Worker Logic", () => {
  beforeAll(() => {
    process.env.__TEST_DISABLE_WORKER = "true";
  });`);

content = content.replace(/it\("le heartbeat prolonge le bail", async \(\) => \{[\s\S]*?\}, 25000\);/,
`it("le heartbeat prolonge le bail", async () => {
    __setLeaseDurationForTest(10000); // 10s lease
    const importId = startGalleryImport(galleryId, "worker-test");
    const job = acquireNextJob();
    expect(job).toBeDefined();

    const before = db.prepare("SELECT lease_expires_at FROM gallery_imports WHERE id = ?").get(importId) as Record<string, unknown>;
    
    // Block the read stream so processImport stays alive
    let unblockStream: () => void;
    const blockPromise = new Promise<void>(r => { unblockStream = r; });
    vi.mocked(fs.createReadStream).mockImplementationOnce(() => {
      const s = new Readable({ read() {} });
      s.push("dummy data");
      blockPromise.then(() => s.push(null));
      return s as unknown as ReturnType<typeof fs.createReadStream>;
    });

    vi.useFakeTimers();
    const processPromise = processImport(importId, galleryId, "worker-test", job!.lease_token);

    // Heartbeat is at 5s. Advance by 6s.
    await vi.advanceTimersByTimeAsync(6000);

    const after = db.prepare("SELECT lease_expires_at FROM gallery_imports WHERE id = ?").get(importId) as Record<string, unknown>;
    expect(after.lease_expires_at as number).toBeGreaterThan(before.lease_expires_at as number);

    // Cleanup
    unblockStream!();
    await vi.advanceTimersByTimeAsync(6000); // let it finish
    vi.useRealTimers();
    await processPromise;
    __setLeaseDurationForTest(30000); // restore
  });`);

fs.writeFileSync(target, content);
console.log("Fixed worker tests 2");
