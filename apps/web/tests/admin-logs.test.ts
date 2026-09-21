import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { action } from "../app/routes/admin";
import { getAdminConfig, requireAdminSession } from "../app/lib/auth.server";
import { getClientIp, validateOrigin } from "../app/lib/security.server";
import { checkRateLimit } from "../app/lib/rate-limit.server";
import * as authServer from "../app/lib/auth.server";
import * as crypto from "node:crypto";

vi.mock("../app/lib/auth.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/lib/auth.server")>();
  return {
    ...actual,
    getAdminConfig: vi.fn(),
    requireAdminSession: vi.fn(),
    verifyAdminPassword: vi.fn(),
    computeCredentialVersion: vi.fn(),
  };
});

vi.mock("../app/lib/security.server", () => ({
  getClientIp: vi.fn(),
  validateOrigin: vi.fn(),
}));

vi.mock("../app/lib/rate-limit.server", () => ({
  checkRateLimit: vi.fn(),
  resetRateLimit: vi.fn(),
}));

vi.mock("../app/lib/session.server", () => ({
  commitSession: vi.fn().mockResolvedValue("mocked-cookie"),
  destroySession: vi.fn().mockResolvedValue("mocked-destroyed-cookie"),
}));

describe("Admin Route Logs Protection", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("should not log sensitive session or cookie data during login", async () => {
    vi.mocked(validateOrigin).mockReturnValue(true);
    vi.mocked(getClientIp).mockReturnValue("127.0.0.1");
    vi.mocked(checkRateLimit).mockImplementation(() => {});
    vi.mocked(getAdminConfig).mockImplementation(() => ({ hash: "$argon2id$mock", secret: "012345678901234567890123456789012" }));
    vi.mocked(authServer.verifyAdminPassword).mockResolvedValue(true);
    vi.mocked(authServer.computeCredentialVersion).mockReturnValue("mock-version");

    const csrfToken = crypto.randomUUID();
    const sessionMock = {
      get: vi.fn((key) => {
        if (key === "csrfToken") return csrfToken;
        return undefined;
      }),
      set: vi.fn(),
      has: vi.fn(),
      unset: vi.fn(),
      data: { someSensitiveKey: "sensitive-value" },
    };

    vi.mocked(requireAdminSession).mockResolvedValue({
      isValid: false,
      // @ts-expect-error
      session: sessionMock,
    });

    const formData = new URLSearchParams();
    formData.append("intent", "login");
    formData.append("password", "correct-password");
    formData.append("csrfToken", csrfToken);

    const request = new Request("https://example.com/admin", {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": String(formData.toString().length),
      },
    });

    const response = await action({ request, params: {}, context: {} } as unknown as Parameters<typeof action>[0]);
    
    expect(response.status).toBe(302);
    
    // Validate that no sensitive logs were introduced
    const calls = consoleLogSpy.mock.calls;
    for (const call of calls) {
      const logMessage = call.join(" ").toLowerCase();
      expect(logMessage).not.toContain("session data");
      expect(logMessage).not.toContain("cookie string");
      expect(logMessage).not.toContain("login success");
    }
  });
});
