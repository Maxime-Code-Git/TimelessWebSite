import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env.server to prevent it from throwing on missing SMTP_HOST during import
vi.mock("../app/lib/env.server", () => ({
  ENV: {
    PUBLIC_SITE_URL: "http://localhost:4173",
    SMTP_HOST: "localhost",
    SMTP_PORT: 2525,
    SMTP_USER: "test",
    SMTP_PASS: "test",
    SMTP_FROM: "test@test.com",
    SMTP_TO: "test@test.com",
    CONTACT_RATE_LIMIT_MAX: 10,
    CONTACT_RATE_LIMIT_SECRET: "secret",
    RATE_LIMIT_DB_PATH: "sqlite.db",
    SITE_CONTENT_PATH: "site-content.json",
    TRUST_PROXY: true,
  }
}));

import { requireSecureAdminMutation, ActionSecurityError, requireValidAdminSession } from "../app/lib/admin-auth.server";
import { requireAdminSession } from "../app/lib/auth.server";

// Mock the dependencies
vi.mock("../app/lib/auth.server", () => ({
  requireAdminSession: vi.fn(),
  constantTimeEqual: vi.fn((a, b) => a === b),
}));

vi.mock("../app/lib/session.server", () => ({
  destroySession: vi.fn().mockResolvedValue("destroyed_cookie"),
}));

describe("admin-auth.server.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminSession).mockResolvedValue({
      isValid: true,
      // @ts-expect-error Mocked session
      session: { get: vi.fn(), set: vi.fn(), has: vi.fn() },
    });
    process.env.PUBLIC_SITE_URL = "http://localhost:4173";
  });

  function createRequest(method: string, body?: string, extraHeaders = {}) {
    const headers = new Headers({
      "Origin": "http://localhost:4173",
      "Content-Type": "application/x-www-form-urlencoded",
      ...extraHeaders,
    });
    const init: RequestInit = { method, headers };
    if (body) {
      init.body = body;
    }
    return new Request("http://localhost:4173/admin/test", init);
  }

  it("should enforce exactly 131072 bytes (128KB) payload limit (Accepted)", async () => {
    const size = 131072;
    const body = "a".repeat(size);
    const req = createRequest("POST", body, { "Content-Length": size.toString() });

    const result = await requireSecureAdminMutation(req);
    expect(result.safeRequest).toBeDefined();
    const clonedBody = await result.safeRequest.text();
    expect(clonedBody.length).toBe(size);
  });

  it("should refuse exactly 131073 bytes payload limit (Rejected 413)", async () => {
    const size = 131073;
    const body = "a".repeat(size);
    const req = createRequest("POST", body, { "Content-Length": size.toString() });

    await expect(requireSecureAdminMutation(req)).rejects.toThrowError(
      new ActionSecurityError("Payload Too Large", 413)
    );
  });

  it("should refuse body > 131072 even without Content-Length (Rejected 413)", async () => {
    const size = 131073;
    const body = "a".repeat(size);
    // Explicitly delete Content-Length to force stream parsing
    const req = createRequest("POST", body);
    req.headers.delete("Content-Length");

    await expect(requireSecureAdminMutation(req)).rejects.toThrowError(
      new ActionSecurityError("Payload Too Large", 413)
    );
  });

  it("should reject invalid Origin with 403", async () => {
    const req = createRequest("POST", "test", { "Origin": "http://evil.com" });
    await expect(requireSecureAdminMutation(req)).rejects.toThrowError(
      new ActionSecurityError("Forbidden", 403)
    );
  });

  it("should reject PUT, DELETE, PATCH with 405", async () => {
    for (const method of ["PUT", "DELETE", "PATCH", "GET", "HEAD"]) {
      const req = createRequest(method, method !== "GET" && method !== "HEAD" ? "test" : undefined);
      await expect(requireSecureAdminMutation(req)).rejects.toThrowError(
        new ActionSecurityError("Method Not Allowed", 405)
      );
    }
  });

  it("should reject malicious Content-Length formats with 400", async () => {
    for (const cl of ["-100", "1.5", "1e5", "9007199254740992"]) {
      const req = createRequest("POST", "test", { "Content-Length": cl });
      await expect(requireSecureAdminMutation(req)).rejects.toThrowError(
        new ActionSecurityError("Invalid Content-Length", 400)
      );
    }
  });

  it("should reject invalid Content-Type with 415", async () => {
    const invalidTypes = [
      "application/json",
      "application/x-www-form-urlencodedevil",
      "text/plain",
      "multipart/form-data"
    ];
    for (const type of invalidTypes) {
      const req = createRequest("POST", "test", { "Content-Type": type });
      await expect(requireSecureAdminMutation(req)).rejects.toThrowError(
        new ActionSecurityError("Unsupported Media Type", 415)
      );
    }
  });

  it("should accept valid Content-Type with spaces", async () => {
    const validTypes = [
      "application/x-www-form-urlencoded",
      "application/x-www-form-urlencoded; charset=utf-8",
      "application/x-www-form-urlencoded ; charset = utf-8",
    ];
    for (const type of validTypes) {
      const req = createRequest("POST", "test", { "Content-Type": type });
      const result = await requireSecureAdminMutation(req);
      expect(result.safeRequest).toBeDefined();
    }
  });

  it("requireValidAdminSession should throw redirect 302 with destroyed cookie if invalid", async () => {
    vi.mocked(requireAdminSession).mockResolvedValue({
      isValid: false,
      // @ts-expect-error Mocked session
      session: { get: vi.fn(), set: vi.fn(), has: vi.fn() },
    });

    const req = createRequest("POST", "test");

    try {
      await requireValidAdminSession(req);
      expect.fail("Should have thrown");
    } catch (e: unknown) {
      expect(e instanceof Response).toBe(true);
      const res = e as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/admin");
      expect(res.headers.get("Set-Cookie")).toBe("destroyed_cookie");
    }
  });
});
