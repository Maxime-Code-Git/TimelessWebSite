import { describe, it, expect, vi, beforeEach } from "vitest";
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
    (requireAdminSession as any).mockResolvedValue({
      isValid: true,
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

  it("should return 400 for negative or malformed Content-Length", async () => {
    const req = createRequest("POST", "test", { "Content-Length": "-100" });
    await expect(requireSecureAdminMutation(req)).rejects.toThrowError(
      new ActionSecurityError("Invalid Content-Length", 400)
    );
  });

  it("should reject invalid Origin with 403", async () => {
    const req = createRequest("POST", "test", { "Origin": "http://evil.com" });
    await expect(requireSecureAdminMutation(req)).rejects.toThrowError(
      new ActionSecurityError("Forbidden", 403)
    );
  });

  it("should reject invalid Content-Type with 415", async () => {
    const req = createRequest("POST", "test", { "Content-Type": "application/json" });
    await expect(requireSecureAdminMutation(req)).rejects.toThrowError(
      new ActionSecurityError("Unsupported Media Type", 415)
    );
  });

  it("requireValidAdminSession should throw redirect 302 with destroyed cookie if invalid", async () => {
    (requireAdminSession as any).mockResolvedValue({
      isValid: false,
      session: { get: vi.fn(), set: vi.fn(), has: vi.fn() },
    });

    const req = createRequest("POST", "test");

    try {
      await requireValidAdminSession(req);
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.status).toBe(302);
      expect(e.headers.get("Location")).toBe("/admin");
      expect(e.headers.get("Set-Cookie")).toBe("destroyed_cookie");
    }
  });
});
