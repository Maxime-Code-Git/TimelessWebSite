import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";

// Mock the node:fs module to prevent any real filesystem access
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    readFileSync: vi.fn(actual.readFileSync),
  };
});

/**
 * Regression test: verifies that scripts/env-loader.js does NOT
 * read .env.local when NODE_ENV=test, preventing secret leakage
 * into test output.
 *
 * Never touches the real .env.local.
 */
describe("env-loader isolation in test mode", () => {
  const originalEnv = process.env;
  const SENTINEL = "DUMMY_SMTP_SECRET_MUST_NOT_APPEAR";

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.clearAllMocks();

    // Simulate existence and content of a fake .env.local
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('.env.local')) {
        return true;
      }
      return false; // For package.json searches
    });

    vi.mocked(fs.readFileSync).mockImplementation((path, _options) => {
      if (typeof path === 'string' && path.includes('.env.local')) {
        return `SMTP_PASS=${SENTINEL}\n`;
      }
      // If it tries to read package.json, return dummy
      if (typeof path === 'string' && path.includes('package.json')) {
        return JSON.stringify({ name: "timeless" });
      }
      throw new Error(`Unexpected readFileSync call: ${path}`);
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("should NOT load .env.local when NODE_ENV=test", async () => {
    // Wipe all env vars, then set only NODE_ENV=test
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    process.env.NODE_ENV = "test";

    // @ts-expect-error untyped JS module
    await import("../../../scripts/env-loader.js");

    // Verify readFileSync was never called for .env.local
    const readCalls = vi.mocked(fs.readFileSync).mock.calls;
    for (const call of readCalls) {
      const pathArg = String(call[0]);
      expect(pathArg).not.toContain(".env.local");
    }

    // Verify no sentinel leaked into process.env
    for (const value of Object.values(process.env)) {
      if (typeof value === "string") {
        expect(value).not.toContain(SENTINEL);
      }
    }
  });

  it("should export loadEnvLocal as a callable function without executing it", async () => {
    const validConfig = {
      PORT: "3000",
      NODE_ENV: "production",
      PUBLIC_SITE_URL: "https://example.com",
      CONTACT_RATE_LIMIT_SECRET: "secret123",
      RATE_LIMIT_DB_PATH: "./rate-limit.db",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "user",
      SMTP_PASS: "pass",
      SMTP_FROM: "from@example.com",
      SMTP_TO: "to@example.com",
      CONTACT_RATE_LIMIT_MAX: "10",
      ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=19456,t=2,p=1$xDSx00u+uSs9AcMqypmthw$ubmjWhg1XWL+Yp496qb5LLlTx0FK4lwqy9pvKa5ills",
      ADMIN_SESSION_SECRET: "12345678901234567890123456789012",
      SITE_CONTENT_PATH: "./site-content.json",
      PORTFOLIO_CONTENT_PATH: "./portfolio.json",
      PORTFOLIO_MEDIA_PATH: "./media"
    };

    // Never set NODE_ENV=development. Always test in test mode.
    process.env.NODE_ENV = "test";

    // @ts-expect-error untyped JS module
    const loader = await import("../../../scripts/env-loader.js");

    // Verify the function exists and is exported
    expect(typeof loader.loadEnvLocal).toBe("function");

    // Ensure that simply importing it didn't trigger readFileSync for .env.local
    const readCalls = vi.mocked(fs.readFileSync).mock.calls;
    for (const call of readCalls) {
      const pathArg = String(call[0]);
      expect(pathArg).not.toContain(".env.local");
    }
  });
});
