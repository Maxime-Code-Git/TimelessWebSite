import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock ENV
vi.mock("../app/lib/env.server", () => ({
  ENV: {
    RATE_LIMIT_DB_PATH: "",
    CONTACT_RATE_LIMIT_SECRET: "secret",
    CONTACT_RATE_LIMIT_MAX: 5
  }
}));

import { checkRateLimit, closeRateLimitDatabase } from "../app/lib/rate-limit.server";
import { ENV } from "../app/lib/env.server";

describe("Rate Limit DB Security", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-rate-limit-"));
    dbPath = path.join(tmpDir, "rate-limit.sqlite");
    // @ts-expect-error Mocking for test
    ENV.RATE_LIMIT_DB_PATH = dbPath;
  });

  afterEach(() => {
    closeRateLimitDatabase();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("creates directory with 0700 and file with 0600", () => {
    checkRateLimit("127.0.0.1", "contact");
    const dirStat = fs.statSync(tmpDir);
    expect((dirStat.mode & 0o777)).toBe(0o700);

    const fileStat = fs.statSync(dbPath);
    expect((fileStat.mode & 0o777)).toBe(0o600);
  });

  it("corrects permissions if directory is too open", () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.chmodSync(tmpDir, 0o777); // too open

    checkRateLimit("127.0.0.1", "contact");

    const dirStat = fs.statSync(tmpDir);
    expect((dirStat.mode & 0o777)).toBe(0o700);
  });

  it("refuses to open symlink for db", () => {
    const realDbPath = path.join(tmpDir, "real.sqlite");
    fs.writeFileSync(realDbPath, "");
    fs.symlinkSync(realDbPath, dbPath);

    expect(() => checkRateLimit("127.0.0.1", "contact")).toThrow("CRITICAL: dbPath cannot be a symbolic link.");
  });
});
