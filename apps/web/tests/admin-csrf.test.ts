import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "../app/routes/admin";
import { getSession, commitSession } from "../app/lib/session.server";
import { computeCredentialVersion } from "../app/lib/auth.server";

vi.mock("../app/lib/env.server", () => ({
  ENV: {
    ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=19456,t=2,p=1$abc$def",
    ADMIN_SESSION_SECRET: "test-session-secret-must-be-32-chars-long",
    PUBLIC_SITE_URL: "https://timeless.example.com",
    TRUST_PROXY: true,
  },
}));

vi.mock("../app/lib/rate-limit.server", () => ({
  checkRateLimit: vi.fn(),
  resetRateLimit: vi.fn(),
}));

describe("Admin CSRF Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function createRequest(intent: "login" | "logout", formCsrf: string, sessionCsrf: string | null, authenticated: boolean) {
    const formData = new URLSearchParams();
    formData.append("intent", intent);
    formData.append("csrfToken", formCsrf);
    if (intent === "login") {
      formData.append("password", "AnyPassword");
    }

    const session = await getSession();
    if (sessionCsrf) {
      session.set("csrfToken", sessionCsrf);
    }
    if (authenticated) {
      session.set("adminId", "123");
      session.set("credentialVersion", computeCredentialVersion());
    }
    const cookie = await commitSession(session);

    return new Request("https://timeless.example.com/admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://timeless.example.com",
        "Cookie": cookie,
        "x-forwarded-for": "192.168.1.1",
      },
      body: formData.toString(),
    });
  }

  describe("Login CSRF", () => {
    it("should reject login without token", async () => {
      const request = await createRequest("login", "", "valid-csrf-token", false);
      const response = await action({ request, params: {}, context: {} } as unknown as import("react-router").ActionFunctionArgs) as Response;
      expect(response.status).toBe(403);
      expect(await response.text()).toBe("Invalid CSRF token");
    });

    it("should reject login with modified token", async () => {
      const request = await createRequest("login", "invalid-token", "valid-csrf-token", false);
      const response = await action({ request, params: {}, context: {} } as unknown as import("react-router").ActionFunctionArgs) as Response;
      expect(response.status).toBe(403);
    });

    it("should allow login with valid token (returns 401 because bad password, not 403)", async () => {
      const request = await createRequest("login", "valid-csrf-token", "valid-csrf-token", false);
      const response = await action({ request, params: {}, context: {} } as unknown as import("react-router").ActionFunctionArgs) as Response;
      expect(response.status).toBe(401);
    });
  });

  describe("Logout CSRF", () => {
    it("should reject logout without token", async () => {
      const request = await createRequest("logout", "", "valid-csrf-token", true);
      const response = await action({ request, params: {}, context: {} } as unknown as import("react-router").ActionFunctionArgs) as Response;
      expect(response.status).toBe(403);
    });

    it("should reject logout with modified token", async () => {
      const request = await createRequest("logout", "invalid-token", "valid-csrf-token", true);
      const response = await action({ request, params: {}, context: {} } as unknown as import("react-router").ActionFunctionArgs) as Response;
      expect(response.status).toBe(403);
    });

    it("should allow logout with valid token", async () => {
      const request = await createRequest("logout", "valid-csrf-token", "valid-csrf-token", true);
      const response = await action({ request, params: {}, context: {} } as unknown as import("react-router").ActionFunctionArgs) as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/admin");
    });
  });
});
