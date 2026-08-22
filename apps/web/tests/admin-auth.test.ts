import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyAdminPassword, computeCredentialVersion, requireAdminSession } from "../app/lib/auth.server";
import { getSession, commitSession, destroySession } from "../app/lib/session.server";
import { hash } from "@node-rs/argon2";
import { ENV } from "../app/lib/env.server";

// Mock env.server so we can inject a test hash
vi.mock("../app/lib/env.server", () => ({
  ENV: {
    ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=19456,t=2,p=1$abc$def",
    ADMIN_SESSION_SECRET: "test-session-secret-must-be-32-chars-long",
  },
}));

describe("Admin Authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure session secret is always present for session tests
    // @ts-expect-error: Mocking readonly property
    ENV.ADMIN_SESSION_SECRET = "test-secret-must-be-32-chars-long";
  });

  describe("verifyAdminPassword", () => {
    it("should return true for correct password", async () => {
      const realHash = await hash("CorrectPassword123", {
        memoryCost: 19456,
        timeCost: 2,
        outputLen: 32,
        parallelism: 1,
      });
      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_PASSWORD_HASH = realHash;
      const isValid = await verifyAdminPassword("CorrectPassword123");
      expect(isValid).toBe(true);
    });

    it("should return false for incorrect password", async () => {
      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$7dIav3z23pS7tqL7aLd1mA$Q8m6i2+6D3Z3L1sO5Q2W4M6T8U0R2V4X6Z8a0c2e4g";
      const isValid = await verifyAdminPassword("WrongPassword456");
      expect(isValid).toBe(false);
    });

    it("should return false for empty password", async () => {
      const isValid = await verifyAdminPassword("");
      expect(isValid).toBe(false);
    });

    it("should return false gracefully if hash is invalid format", async () => {
      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_PASSWORD_HASH = "invalid-hash-format";
      const isValid = await verifyAdminPassword("AnyPassword");
      expect(isValid).toBe(false);
    });
  });

  describe("Admin Session", () => {
    it("should create, commit, and destroy session correctly", async () => {
      const session = await getSession();
      expect(session.has("adminId")).toBe(false);

      session.set("adminId", "test-uuid");
      expect(session.get("adminId")).toBe("test-uuid");

      const cookieString = await commitSession(session);
      expect(typeof cookieString).toBe("string");
      expect(cookieString).toContain("__admin_session=");
      expect(cookieString).toContain("HttpOnly");
      expect(cookieString).toContain("SameSite=Strict");

      const parsedSession = await getSession(cookieString);
      expect(parsedSession.get("adminId")).toBe("test-uuid");

      const destroyCookieString = await destroySession(parsedSession);
      expect(typeof destroyCookieString).toBe("string");
      expect(destroyCookieString).toContain("__admin_session=;");
      expect(destroyCookieString).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    });

    it("should reject tampered cookies", async () => {
      const session = await getSession();
      session.set("adminId", "test-uuid");
      const cookieString = await commitSession(session);

      const tamperedCookieString = cookieString.replace(
        /__admin_session=[^;]+/,
        "__admin_session=tampered-value",
      );

      const parsedSession = await getSession(tamperedCookieString);
      expect(parsedSession.has("adminId")).toBe(false);
    });
  });

  describe("credentialVersion", () => {
    it("should produce a deterministic opaque version", () => {
      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$abc$def";
      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_SESSION_SECRET = "secret-A-must-be-32-chars-long-123";

      const v1 = computeCredentialVersion();
      const v2 = computeCredentialVersion();
      expect(v1).toBe(v2);
      expect(v1).toHaveLength(32);
    });

    it("should change when ADMIN_PASSWORD_HASH changes", () => {
      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_SESSION_SECRET = "secret-B-must-be-32-chars-long-123";
      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$hash1$salt1";
      const v1 = computeCredentialVersion();

      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$hash2$salt2";
      const v2 = computeCredentialVersion();

      expect(v1).not.toBe(v2);
    });

    it("should change when ADMIN_SESSION_SECRET changes", () => {
      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$hash3$salt3";
      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_SESSION_SECRET = "secret-C-must-be-32-chars-long-123";
      const v1 = computeCredentialVersion();

      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_SESSION_SECRET = "secret-D-must-be-32-chars-long-123";
      const v2 = computeCredentialVersion();

      expect(v1).not.toBe(v2);
    });

    it("should invalidate session when hash changes", async () => {
      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_SESSION_SECRET = "secret-invalidation-test-32-chars!";
      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$hashA$saltA";

      const versionA = computeCredentialVersion();
      const session = await getSession();
      session.set("adminId", "uuid-1");
      session.set("credentialVersion", versionA);
      const cookieString = await commitSession(session);

      // Verify session is valid currently
      const req1 = new Request("https://example.com", { headers: { Cookie: cookieString } });
      const { isValid: valid1 } = await requireAdminSession(req1);
      expect(valid1).toBe(true);

      // Change the password hash
      // @ts-expect-error: Mocking readonly property
      ENV.ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$hashC$saltC";

      // Verify session is now invalid
      const req2 = new Request("https://example.com", { headers: { Cookie: cookieString } });
      const { isValid: valid2, session: invalidSession } = await requireAdminSession(req2);
      expect(valid2).toBe(false);

      // Confirm that the session returned can be destroyed
      const destroyStr = await destroySession(invalidSession);
      expect(destroyStr).toContain("__admin_session=;");
      expect(destroyStr).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    });
  });
});
