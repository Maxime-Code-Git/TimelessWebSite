import { describe, it, expect, vi, beforeEach } from "vitest";
import { ENV } from "../app/lib/env.server";

// Mock env.server with admin vars absent
vi.mock("../app/lib/env.server", () => ({
  ENV: {
    ADMIN_PASSWORD_HASH: undefined,
    ADMIN_SESSION_SECRET: undefined,
    CONTACT_RATE_LIMIT_SECRET: "test-secret",
    RATE_LIMIT_DB_PATH: ":memory:",
    CONTACT_RATE_LIMIT_MAX: 5,
  },
}));

describe("Admin module isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("without ADMIN_PASSWORD_HASH / ADMIN_SESSION_SECRET", () => {
    it("verifyAdminPassword should return false", async () => {
      const { verifyAdminPassword } = await import("../app/lib/auth.server");
      const result = await verifyAdminPassword("anything");
      expect(result).toBe(false);
    });

    it("computeCredentialVersion should throw a Response", async () => {
      const { computeCredentialVersion } = await import("../app/lib/auth.server");
      try {
        computeCredentialVersion();
        expect.unreachable("Should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Response);
        expect((err as Response).status).toBe(503);
      }
    });

    it("session.server getSession should throw when secret is missing", async () => {
      const { getSession } = await import("../app/lib/session.server");
      // getSession calls the factory synchronously, which throws
      expect(() => getSession()).toThrow("ADMIN_SESSION_SECRET is not configured");
    });
  });

  describe("with valid admin config", () => {
    it("computeCredentialVersion should return an opaque string", async () => {
      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$abc$def";
      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_SESSION_SECRET = "valid-secret-must-be-32-chars-long-1234567";

      const { computeCredentialVersion } = await import("../app/lib/auth.server");
      const version = computeCredentialVersion();
      expect(version.length).toBe(32);
      expect(version).not.toContain("argon2");
    });
  });
});
