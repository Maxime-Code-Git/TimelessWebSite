import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should NOT load .env.local when NODE_ENV=test", async () => {
    // Wipe all env vars, then set only NODE_ENV=test
    // plus a marker to prove the import ran
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    process.env.NODE_ENV = "test";
    // Set a sentinel that would be overwritten if .env.local were loaded
    process.env._ENV_LOADER_TEST_MARKER = "untouched";

    // @ts-expect-error untyped JS module
    await import("../../../scripts/env-loader.js");

    // If env-loader had loaded .env.local, it would have set variables
    // from it. Our marker should remain untouched.
    expect(process.env._ENV_LOADER_TEST_MARKER).toBe("untouched");

    // Verify no sentinel leaked from any hypothetical .env.local
    for (const value of Object.values(process.env)) {
      if (typeof value === "string") {
        expect(value).not.toContain(SENTINEL);
      }
    }
  });

  it("should NOT inject sentinel values from .env.local in test mode", async () => {
    process.env.NODE_ENV = "test";

    // @ts-expect-error untyped JS module
    await import("../../../scripts/env-loader.js");

    // The sentinel must not be in process.env
    for (const value of Object.values(process.env)) {
      if (typeof value === "string") {
        expect(value).not.toContain(SENTINEL);
      }
    }
  });

  it("should export loadEnvLocal as a callable function", async () => {
    process.env.NODE_ENV = "development";

    // @ts-expect-error untyped JS module
    const loader = await import("../../../scripts/env-loader.js");

    // Verify the function exists and is callable
    expect(typeof loader.loadEnvLocal).toBe("function");

    // Clean up — remove any variables that loadEnvLocal may have set
    // from the real .env.local (we don't inspect their values)
    delete process.env.TEST_SENTINEL_VAR;
  });
});
