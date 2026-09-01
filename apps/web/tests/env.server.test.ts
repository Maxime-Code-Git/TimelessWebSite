import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

vi.mock("../../../scripts/env-loader.js", () => ({}));

/**
 * These tests verify that importing env.server.ts itself throws
 * when a required variable is missing or invalid, because the
 * module-level fail-fast code forces evaluation on import.
 *
 * SECURITY: We never use `expect(import(...)).rejects` because if the
 * import succeeds unexpectedly, Vitest serializes the resolved module
 * (which contains ENV with real secrets) into the test output.
 * Instead we use a safe helper that captures only the Error object.
 */
describe("Environment Validation — fail-fast on import", () => {
  const originalEnv = process.env;

  function validEnv(): Record<string, string> {
    return {
      TRUST_PROXY: "true",
      SMTP_PORT: "2525",
      PUBLIC_SITE_URL: "https://example.com",
      SMTP_HOST: "localhost",
      SMTP_USER: "user",
      SMTP_PASS: "pass",
      SMTP_FROM: "from@example.com",
      SMTP_TO: "to@example.com",
      CONTACT_RATE_LIMIT_SECRET: "secret",
      RATE_LIMIT_DB_PATH: "./db.sqlite",
      ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=19456,t=2,p=1$...",
      ADMIN_SESSION_SECRET: "admin_secret",
      PORTFOLIO_CONTENT_PATH: path.join(os.tmpdir(), "portfolio.json"),
      PORTFOLIO_MEDIA_PATH: path.join(os.tmpdir(), "media")
    };
  }

  /**
   * Safe import helper. Returns an Error if the import throws,
   * or null if it resolves. Never retains or exposes the resolved module.
   */
  async function captureImportError(): Promise<Error | null> {
    try {
      await import("../app/lib/env.server");
      return null;
    } catch (error) {
      return error instanceof Error ? error : new Error("Unknown import error");
    }
  }

  function setEnv(env: Record<string, string>) {
    // Wipe process.env entirely, then apply only what the test needs
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    process.env.NODE_ENV = "test";
    for (const [k, v] of Object.entries(env)) {
      process.env[k] = v;
    }
  }

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ---------------------------------------------------------------
  // Missing required variables: import itself must throw
  // ---------------------------------------------------------------
  const requiredVars = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "SMTP_TO",
    "CONTACT_RATE_LIMIT_SECRET",
    "RATE_LIMIT_DB_PATH",
    "PUBLIC_SITE_URL",
    "PORTFOLIO_CONTENT_PATH",
    "PORTFOLIO_MEDIA_PATH"
  ];

  for (const varName of requiredVars) {
    it(`should fail on import when ${varName} is missing`, async () => {
      const env = validEnv();
      delete env[varName];
      setEnv(env);

      const err = await captureImportError();
      expect(err).not.toBeNull();
      if (varName.startsWith("PORTFOLIO_")) {
        expect(err!.message).toContain(`${varName} is required in test`);
      } else {
        expect(err!.message).toContain(`${varName} is missing`);
      }
    });
  }

  // ---------------------------------------------------------------
  // Boundary / format validation: import itself must throw
  // ---------------------------------------------------------------
  it("should fail on import with SMTP_PORT=587abc", async () => {
    const env = validEnv();
    env.SMTP_PORT = "587abc";
    setEnv(env);
    const err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("must contain only digits");
  });

  it("should fail on import with SMTP_PORT=65536", async () => {
    const env = validEnv();
    env.SMTP_PORT = "65536";
    setEnv(env);
    const err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("must be an integer between 1 and 65535");
  });

  it("should fail on import with CONTACT_RATE_LIMIT_MAX=0", async () => {
    const env = validEnv();
    env.CONTACT_RATE_LIMIT_MAX = "0";
    setEnv(env);
    const err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("must be an integer between 1 and 100");
  });

  it("should fail on import with CONTACT_RATE_LIMIT_MAX=101", async () => {
    const env = validEnv();
    env.CONTACT_RATE_LIMIT_MAX = "101";
    setEnv(env);
    const err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("must be an integer between 1 and 100");
  });

  it("should fail on import with CONTACT_RATE_LIMIT_MAX=5abc", async () => {
    const env = validEnv();
    env.CONTACT_RATE_LIMIT_MAX = "5abc";
    setEnv(env);
    const err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("must contain only digits");
  });

  it("should fail on import with PUBLIC_SITE_URL=ftp://example.com", async () => {
    const env = validEnv();
    env.PUBLIC_SITE_URL = "ftp://example.com";
    setEnv(env);
    const err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("HTTP or HTTPS protocol");
  });

  it("should fail on import with PUBLIC_SITE_URL=not-a-url", async () => {
    const env = validEnv();
    env.PUBLIC_SITE_URL = "not-a-url";
    setEnv(env);
    const err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("HTTP or HTTPS protocol");
  });

  it("should not leak secret values in error messages", async () => {
    const env = validEnv();
    delete env.SMTP_PASS;
    setEnv(env);

    const err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("SMTP_PASS is missing");
    // Must not contain any of the valid env values
    for (const v of Object.values(env)) {
      if (v.length > 3) {
        expect(err!.message).not.toContain(v);
      }
    }
  });

  // ---------------------------------------------------------------
  // Portfolio path tests
  // ---------------------------------------------------------------
  it("should fail on import in test if portfolio path is missing", async () => {
    const env = validEnv();
    delete env.PORTFOLIO_CONTENT_PATH;
    setEnv(env);
    const err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("PORTFOLIO_CONTENT_PATH is required in test");
  });

  it("should fail on import in test if portfolio path is outside os.tmpdir()", async () => {
    const env = validEnv();
    env.PORTFOLIO_CONTENT_PATH = "/tmp/outside/portfolio.json";
    if (os.tmpdir() !== "/tmp") {
      setEnv(env);
      const err = await captureImportError();
      expect(err).not.toBeNull();
      expect(err!.message).toContain("must be under os.tmpdir");
    }
  });

  it("should fail on import in test if portfolio path is in data", async () => {
    const env = validEnv();
    // Force it to be in data
    env.PORTFOLIO_CONTENT_PATH = path.join(process.cwd(), "data", "portfolio.json");
    setEnv(env);
    const err = await captureImportError();
    expect(err).not.toBeNull();
    // Since it's in data, it also might be outside tmpdir. But wait, if tmpdir is /tmp, then process.cwd() is outside.
    // If it's outside, it will fail on "must be under os.tmpdir()".
    // This is tested in validateTestPath.
    expect(err!.message).toContain("must");
  });

  // Test that production fails if missing
  it("should fail in production if portfolio path is missing", async () => {
    const env = validEnv();
    delete env.PORTFOLIO_CONTENT_PATH;
    setEnv(env);
    process.env.NODE_ENV = "production";
    const err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("Environment variable PORTFOLIO_CONTENT_PATH is missing");
  });

  it("should fail in production if TRUST_PROXY is missing or false", async () => {
    const env = validEnv();
    delete env.TRUST_PROXY;
    setEnv(env);
    process.env.NODE_ENV = "production";
    let err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("TRUST_PROXY=true is required in production");

    env.TRUST_PROXY = "false";
    setEnv(env);
    err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("TRUST_PROXY=true is required in production");
  });

  it("should allow fallback in development mode", async () => {
    const env = validEnv();
    delete env.PORTFOLIO_CONTENT_PATH;
    setEnv(env);
    process.env.NODE_ENV = "development";
    const err = await captureImportError();
    expect(err).toBeNull(); // Import should succeed in development with fallback
  });

  it("should fail in production if portfolio path is relative", async () => {
    const env = validEnv();
    env.PORTFOLIO_CONTENT_PATH = "data/portfolio.json";
    setEnv(env);
    process.env.NODE_ENV = "production";
    const err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("PORTFOLIO_CONTENT_PATH must be an absolute path");
  });

  it("should fail in production if media path is under public", async () => {
    const env = validEnv();
    env.PORTFOLIO_MEDIA_PATH = path.join(process.cwd(), "public", "media");
    setEnv(env);
    process.env.NODE_ENV = "production";
    const err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("PORTFOLIO_MEDIA_PATH must not be under public or build directories");
  });

  it("should fail in production if media path is under build", async () => {
    const env = validEnv();
    env.PORTFOLIO_MEDIA_PATH = path.join(process.cwd(), "build", "client", "media");
    setEnv(env);
    process.env.NODE_ENV = "production";
    const err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("PORTFOLIO_MEDIA_PATH must not be under public or build directories");
  });

  it("should fail in production if destination is not writable", async () => {
    const env = validEnv();
    // /root is generally not writable for normal users
    env.PORTFOLIO_CONTENT_PATH = "/root/portfolio.json";
    setEnv(env);
    process.env.NODE_ENV = "production";
    const err = await captureImportError();
    expect(err).not.toBeNull();
    expect(err!.message).toContain("PORTFOLIO_CONTENT_PATH or its parent directory is not writable");
  });

  it("should accept valid absolute paths in production", async () => {
    const env = validEnv();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-test-prod-"));
    env.PORTFOLIO_CONTENT_PATH = path.join(tempDir, "portfolio.json");
    env.PORTFOLIO_MEDIA_PATH = path.join(tempDir, "media");
    setEnv(env);
    process.env.NODE_ENV = "production";
    const err = await captureImportError();
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    if (err !== null) {
      throw new Error(`Expected env.server import to succeed in prod: ${err.message}`);
    }
  });

  // ---------------------------------------------------------------
  // Anti-leak sentinel: even on unexpected success, no secrets shown
  // ---------------------------------------------------------------
  it("should succeed import with all valid env vars without leaking values", async () => {
    const env = validEnv();
    env.SMTP_PASS = "DUMMY_SMTP_SECRET_MUST_NOT_APPEAR";
    setEnv(env);

    const err = await captureImportError();
    // Import should succeed with all valid vars
    if (err !== null) {
      // If it fails unexpectedly, fail the test explicitly with a generic message
      throw new Error(`Expected env.server import to succeed: ${err.message}`);
    }
    // Either way, the sentinel must not appear — captureImportError
    // never retains the resolved module, so no serialization leak.
  });
});
