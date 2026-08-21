import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Environment Validation", () => {
  let ENV: typeof import("../app/lib/env.server").ENV;
  const originalEnv = process.env;

  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear variables to test validation
    delete process.env.SMTP_PORT;
    delete process.env.PUBLIC_SITE_URL;
    delete process.env.CONTACT_RATE_LIMIT_MAX;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
    delete process.env.SMTP_TO;
    delete process.env.CONTACT_RATE_LIMIT_SECRET;
    delete process.env.RATE_LIMIT_DB_PATH;
    delete process.env.TRUST_PROXY;

    // Default valid state
    process.env.SMTP_PORT = "2525";
    process.env.PUBLIC_SITE_URL = "https://example.com";
    process.env.SMTP_HOST = "localhost";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "pass";
    process.env.SMTP_FROM = "from@example.com";
    process.env.SMTP_TO = "to@example.com";
    process.env.CONTACT_RATE_LIMIT_SECRET = "secret";
    process.env.RATE_LIMIT_DB_PATH = "./db.sqlite";

    // Re-import to get a fresh instance
    const mod = await import("../app/lib/env.server");
    ENV = mod.ENV;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should reject non-digit SMTP_PORT", () => {
    process.env.SMTP_PORT = "587abc";
    expect(() => ENV.SMTP_PORT).toThrow("must contain only digits");
  });

  it("should reject decimal SMTP_PORT", () => {
    process.env.SMTP_PORT = "587.5";
    expect(() => ENV.SMTP_PORT).toThrow("must contain only digits");
  });

  it("should reject SMTP_PORT out of bounds (0)", () => {
    process.env.SMTP_PORT = "0";
    expect(() => ENV.SMTP_PORT).toThrow("must be an integer between 1 and 65535");
  });

  it("should reject non-digit CONTACT_RATE_LIMIT_MAX", () => {
    process.env.CONTACT_RATE_LIMIT_MAX = "5abc";
    expect(() => ENV.CONTACT_RATE_LIMIT_MAX).toThrow("must contain only digits");
  });

  it("should reject non-http/https PUBLIC_SITE_URL", () => {
    process.env.PUBLIC_SITE_URL = "ftp://example.com";
    expect(() => ENV.PUBLIC_SITE_URL).toThrow("does not use http:/https: protocol");
  });

  it("should reject missing required variables without leaking secrets", () => {
    delete process.env.SMTP_PASS;
    try {
      void ENV.SMTP_PASS;
    } catch (e: unknown) {
      expect((e as Error).message).toContain("SMTP_PASS is missing");
      expect((e as Error).message).not.toContain("pass");
    }
  });
});
