import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { createE2EEnvironment } from "../scripts/run-e2e.js";

describe("run-e2e script environment", () => {
  let tempRoot: string;
  let sourceEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-e2e-test-"));
    sourceEnv = { 
      PATH: "/usr/bin",
      NODE_ENV: "development",
      USER: "testuser"
    };
  });

  afterEach(() => {
    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("should securely inject E2E_ADMIN_PASSWORD and isolated paths into environment", () => {
    const resultEnv = createE2EEnvironment(tempRoot, sourceEnv);

    // Verify password injection
    expect(resultEnv.E2E_ADMIN_PASSWORD).toBe("e2e_password");

    // Verify source env is not mutated
    expect(sourceEnv.E2E_ADMIN_PASSWORD).toBeUndefined();
    expect(sourceEnv.NODE_ENV).toBe("development");

    // Verify result env inherited correctly and overrides where expected
    expect(resultEnv.USER).toBe("testuser");
    expect(resultEnv.NODE_ENV).toBe("test");

    // Verify paths are mapped within tempRoot
    const pathKeys = [
      "E2E_SMTP_INBOX_PATH",
      "E2E_SMTP_MODE_PATH",
      "SITE_CONTENT_PATH",
      "PORTFOLIO_CONTENT_PATH",
      "PORTFOLIO_MEDIA_PATH",
      "SITE_MEDIA_PATH",
      "RATE_LIMIT_DB_PATH",
      "BOOKING_DB_PATH",
      "GALLERY_DB_PATH",
      "GALLERY_MEDIA_PATH",
      "GALLERY_IMPORT_PATH",
    ];

    for (const key of pathKeys) {
      const p = resultEnv[key] as string;
      expect(p).toBeDefined();
      expect(p.startsWith(tempRoot)).toBe(true);
      expect(p).not.toContain("/data/");
      expect(p).not.toContain("/public/");
      expect(p).not.toContain("/build/");
    }
  });
});
