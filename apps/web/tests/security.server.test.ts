import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateOrigin, getClientIp, readStrictFormUrlEncoded } from "../app/lib/security.server";
import { ENV } from "../app/lib/env.server";

vi.mock("../app/lib/env.server", () => ({
  ENV: {
    PUBLIC_SITE_URL: "https://timeless.example.com",
    TRUST_PROXY: true,
  },
}));

describe("security.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error: readonly mock
    ENV.PUBLIC_SITE_URL = "https://timeless.example.com";
    // @ts-expect-error: readonly mock
    ENV.TRUST_PROXY = true;
  });

  describe("validateOrigin", () => {
    it("should accept exact origin match", () => {
      const req = new Request("https://timeless.example.com/api", {
        headers: { Origin: "https://timeless.example.com" },
      });
      expect(validateOrigin(req)).toBe(true);
    });

    it("should reject missing origin", () => {
      const req = new Request("https://timeless.example.com/api");
      expect(validateOrigin(req)).toBe(false);
    });

    it("should reject different domain", () => {
      const req = new Request("https://timeless.example.com/api", {
        headers: { Origin: "https://evil.example.com" },
      });
      expect(validateOrigin(req)).toBe(false);
    });

    it("should reject subdomain of exact origin", () => {
      const req = new Request("https://timeless.example.com/api", {
        headers: { Origin: "https://sub.timeless.example.com" },
      });
      expect(validateOrigin(req)).toBe(false);
    });

    it("should reject fake domain ending with same string", () => {
      const req = new Request("https://timeless.example.com/api", {
        headers: { Origin: "https://faketimeless.example.com" },
      });
      expect(validateOrigin(req)).toBe(false);
    });

    it("should reject malformed origin", () => {
      const req = new Request("https://timeless.example.com/api", {
        headers: { Origin: "not-a-url" },
      });
      expect(validateOrigin(req)).toBe(false);
    });
  });

  describe("getClientIp", () => {
    it("should return X-Forwarded-For when TRUST_PROXY is true", () => {
      const req = new Request("https://timeless.example.com", {
        headers: { "x-forwarded-for": "192.168.1.1" },
      });
      expect(getClientIp(req)).toBe("192.168.1.1");
    });

    it("should reject multiple IPs in X-Forwarded-For to prevent spoofing", () => {
      const req = new Request("https://timeless.example.com", {
        headers: { "x-forwarded-for": "192.168.1.1, 10.0.0.1" },
      });
      expect(getClientIp(req)).toBe(null);
    });

    it("should reject invalid IP format", () => {
      const req = new Request("https://timeless.example.com", {
        headers: { "x-forwarded-for": "not-an-ip" },
      });
      expect(getClientIp(req)).toBe(null);
    });

    it("should ignore X-Forwarded-For when TRUST_PROXY is false", () => {
      // @ts-expect-error: readonly mock
      ENV.TRUST_PROXY = false;
      const req = new Request("https://timeless.example.com", {
        headers: { "x-forwarded-for": "192.168.1.1" },
      });
      expect(getClientIp(req)).toBe("127.0.0.1");
    });
  });

  describe("readStrictFormUrlEncoded", () => {

    it("should accept valid urlencoded payload", async () => {
      const req = new Request("https://timeless.example.com", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "foo=bar&baz=123"
      });
      const data = await readStrictFormUrlEncoded(req);
      expect(data.get("foo")).toBe("bar");
      expect(data.get("baz")).toBe("123");
    });

    it("should reject wrong content-type", async () => {
      const req = new Request("https://timeless.example.com", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"foo":"bar"}'
      });
      await expect(readStrictFormUrlEncoded(req)).rejects.toThrow("Unsupported Media Type");
    });

    it("should enforce size limit", async () => {
      const largeBody = "a=" + "A".repeat(5000); // Exceeds 4096 bytes limit
      const req = new Request("https://timeless.example.com", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: largeBody
      });
      await expect(readStrictFormUrlEncoded(req, 4096)).rejects.toThrow("Payload Too Large");
    });
  });
});
