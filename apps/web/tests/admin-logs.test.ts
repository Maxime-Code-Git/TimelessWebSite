import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Session } from "react-router";
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
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
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
    const sessionMock: Session = {
      id: "test-session-id",
      get: vi.fn((key: string) => {
        if (key === "csrfToken") return csrfToken;
        return undefined;
      }) as unknown as Session["get"],
      set: vi.fn(),
      has: vi.fn(),
      unset: vi.fn(),
      flash: vi.fn(),
      data: { someSensitiveKey: "sensitive-value" },
    };

    vi.mocked(requireAdminSession).mockResolvedValue({
      isValid: false,
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
    const allCalls = [
      ...consoleLogSpy.mock.calls,
      ...consoleInfoSpy.mock.calls,
      ...consoleDebugSpy.mock.calls,
      ...consoleWarnSpy.mock.calls,
      ...consoleErrorSpy.mock.calls,
    ];

    for (const call of allCalls) {
      const logMessage = call.join(" ").toLowerCase();
      // Ensure no sensitive data is present in any format
      expect(logMessage).not.toContain("correct-password");
      expect(logMessage).not.toContain("mocked-cookie");
      expect(logMessage).not.toContain("sensitive-value");
      expect(logMessage).not.toContain(csrfToken.toLowerCase());
      expect(logMessage).not.toContain("012345678901234567890123456789012");
    }
  });
});
