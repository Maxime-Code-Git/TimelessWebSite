import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { vi } from "vitest";

vi.mock("smtp-server", () => ({
  SMTPServer: class {
    listen(port: unknown, host: unknown, cb: unknown) {
      if (typeof cb === 'function') cb();
      else if (typeof host === 'function') host();
    }
    close(cb: unknown) { if (typeof cb === 'function') cb(); }
    on() {}
  }
}));

describe("run-e2e script environment", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let tempBin: string;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempBin = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-bin-"));
    // Create a fake npx that just exits immediately so we don't really run Playwright
    fs.writeFileSync(path.join(tempBin, "npx"), `#!/bin/sh\nexit 0\n`, { mode: 0o755 });
    // Also create a fake openssl to avoid generating certs during the test
    fs.writeFileSync(path.join(tempBin, "openssl"), `#!/bin/sh\nexit 0\n`, { mode: 0o755 });
    process.env.PATH = `${tempBin}:${process.env.PATH}`;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (fs.existsSync(tempBin)) fs.rmSync(tempBin, { recursive: true, force: true });
  });

  it("should securely inject E2E_ADMIN_PASSWORD into environment", async () => {
    delete process.env.E2E_ADMIN_PASSWORD;

    // Create dummy certs so generateCerts doesn't throw ENOENT when it reads them
    const certsDir = path.join(__dirname, "../e2e/certs");
    fs.mkdirSync(certsDir, { recursive: true });
    fs.writeFileSync(path.join(certsDir, "test-key.pem"), "dummy key");
    fs.writeFileSync(path.join(certsDir, "test-cert.pem"), "dummy cert");

    // @ts-expect-error script lacks type definitions
    const runner = await import("../scripts/run-e2e.js");
    try {
      await runner.run();
    } catch (err) {
      console.error("RUNNER ERROR", err);
    }

    // Verify it was injected globally (since run-e2e.js sets it on process.env)
    expect(process.env.E2E_ADMIN_PASSWORD).toBe("e2e_password");

    // Verify it does not rely on a production DB path
    expect(process.env.RATE_LIMIT_DB_PATH).toContain("timeless-e2e-");
  });
});
