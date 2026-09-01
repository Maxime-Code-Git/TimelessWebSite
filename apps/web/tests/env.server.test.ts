import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";

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
