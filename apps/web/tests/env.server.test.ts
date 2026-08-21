import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * These tests verify that importing env.server.ts itself throws
 * when a required variable is missing or invalid, because the
 * module-level fail-fast code forces evaluation on import.
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
    };
  }

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
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
  ];

  for (const varName of requiredVars) {
    it(`should fail on import when ${varName} is missing`, async () => {
      const env = validEnv();
      delete env[varName];
      // Set all vars except the one under test
      for (const [k, v] of Object.entries(env)) {
        process.env[k] = v;
      }
      // Clear the variable under test
      delete process.env[varName];

      await expect(
        import("../app/lib/env.server")
      ).rejects.toThrow(`${varName} is missing`);
    });
  }

  // ---------------------------------------------------------------
  // Boundary / format validation: import itself must throw
  // ---------------------------------------------------------------
  it("should fail on import with SMTP_PORT=587abc", async () => {
    const env = validEnv();
    env.SMTP_PORT = "587abc";
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    await expect(import("../app/lib/env.server")).rejects.toThrow("must contain only digits");
  });

  it("should fail on import with SMTP_PORT=65536", async () => {
    const env = validEnv();
    env.SMTP_PORT = "65536";
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    await expect(import("../app/lib/env.server")).rejects.toThrow("must be an integer between 1 and 65535");
  });

  it("should fail on import with CONTACT_RATE_LIMIT_MAX=0", async () => {
    const env = validEnv();
    env.CONTACT_RATE_LIMIT_MAX = "0";
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    await expect(import("../app/lib/env.server")).rejects.toThrow("must be an integer between 1 and 100");
  });

  it("should fail on import with CONTACT_RATE_LIMIT_MAX=101", async () => {
    const env = validEnv();
    env.CONTACT_RATE_LIMIT_MAX = "101";
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    await expect(import("../app/lib/env.server")).rejects.toThrow("must be an integer between 1 and 100");
  });

  it("should fail on import with CONTACT_RATE_LIMIT_MAX=5abc", async () => {
    const env = validEnv();
    env.CONTACT_RATE_LIMIT_MAX = "5abc";
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    await expect(import("../app/lib/env.server")).rejects.toThrow("must contain only digits");
  });

  it("should fail on import with PUBLIC_SITE_URL=ftp://example.com", async () => {
    const env = validEnv();
    env.PUBLIC_SITE_URL = "ftp://example.com";
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    await expect(import("../app/lib/env.server")).rejects.toThrow("HTTP or HTTPS protocol");
  });

  it("should fail on import with PUBLIC_SITE_URL=not-a-url", async () => {
    const env = validEnv();
    env.PUBLIC_SITE_URL = "not-a-url";
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    await expect(import("../app/lib/env.server")).rejects.toThrow("HTTP or HTTPS protocol");
  });

  it("should not leak secret values in error messages", async () => {
    const env = validEnv();
    delete env.SMTP_PASS;
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    delete process.env.SMTP_PASS;
    try {
      await import("../app/lib/env.server");
      expect.unreachable("import should have thrown");
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toContain("SMTP_PASS is missing");
      // Must not contain any of the valid env values
      for (const v of Object.values(env)) {
        if (v.length > 3) {
          expect(msg).not.toContain(v);
        }
      }
    }
  });
});
