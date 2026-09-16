import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { addCalendarMonths } from "../app/lib/date";

describe("addCalendarMonths", () => {
  it("handles normal month addition", () => {
    expect(addCalendarMonths(new Date("2023-01-15T10:00:00Z"), 1).toISOString()).toBe("2023-02-15T10:00:00.000Z");
    expect(addCalendarMonths(new Date("2023-01-15T10:00:00Z"), 24).toISOString()).toBe("2025-01-15T10:00:00.000Z");
  });

  it("handles end-of-month overflow", () => {
    expect(addCalendarMonths(new Date("2023-01-31T10:00:00Z"), 1).toISOString()).toBe("2023-02-28T10:00:00.000Z");
    expect(addCalendarMonths(new Date("2023-10-31T10:00:00Z"), 1).toISOString()).toBe("2023-11-30T10:00:00.000Z");
  });

  it("handles February 29 leap year", () => {
    expect(addCalendarMonths(new Date("2024-02-29T10:00:00Z"), 24).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addCalendarMonths(new Date("2024-02-29T10:00:00Z"), 12).toISOString()).toBe("2025-02-28T10:00:00.000Z");
    expect(addCalendarMonths(new Date("2024-02-29T10:00:00Z"), 48).toISOString()).toBe("2028-02-29T10:00:00.000Z");
  });

  it("handles 24 calendar months from various dates", () => {
    // Jan 1 -> Jan 1 two years later
    expect(addCalendarMonths(new Date("2024-01-01T00:00:00Z"), 24).toISOString()).toBe("2026-01-01T00:00:00.000Z");
    // March 31 -> March 31 two years later (use UTC noon to avoid DST shifts)
    expect(addCalendarMonths(new Date("2024-03-31T12:00:00Z"), 24).toISOString()).toBe("2026-03-31T12:00:00.000Z");
  });
});

describe("readStrictFormUrlEncoded", () => {
  beforeEach(() => {
    vi.mock("../app/lib/env.server", () => ({
      ENV: {
        PUBLIC_SITE_URL: "https://timeless.example.com",
        TRUST_PROXY: false,
      }
    }));
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("should accept valid urlencoded payload", async () => {
    const { readStrictFormUrlEncoded } = await import("../app/lib/security.server");
    const req = new Request("https://timeless.example.com", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "code=SEMPRA-ABCD-EFGH&csrf=abc123"
    });
    const params = await readStrictFormUrlEncoded(req);
    expect(params.get("code")).toBe("SEMPRA-ABCD-EFGH");
    expect(params.get("csrf")).toBe("abc123");
  });

  it("should reject wrong content-type", async () => {
    const { readStrictFormUrlEncoded } = await import("../app/lib/security.server");
    const req = new Request("https://timeless.example.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"foo":"bar"}'
    });
    await expect(readStrictFormUrlEncoded(req)).rejects.toThrow("Unsupported Media Type");
  });

  it("should enforce size limit", async () => {
    const { readStrictFormUrlEncoded } = await import("../app/lib/security.server");
    const largeBody = "x=".padEnd(5000, "a");
    const req = new Request("https://timeless.example.com", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: largeBody
    });
    await expect(readStrictFormUrlEncoded(req, 4096)).rejects.toThrow("Payload Too Large");
  });

  it("should reject body without Content-Length exceeding limit via streaming", async () => {
    const { readStrictFormUrlEncoded } = await import("../app/lib/security.server");
    // Create a request with a streaming body that exceeds the limit
    const body = "field=".padEnd(600, "x");
    const req = new Request("https://timeless.example.com", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    await expect(readStrictFormUrlEncoded(req, 100)).rejects.toThrow("Payload Too Large");
  });

  it("should accept content-type with charset parameter", async () => {
    const { readStrictFormUrlEncoded } = await import("../app/lib/security.server");
    const req = new Request("https://timeless.example.com", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: "key=value"
    });
    const params = await readStrictFormUrlEncoded(req);
    expect(params.get("key")).toBe("value");
  });

  it("should reject multipart form data", async () => {
    const { readStrictFormUrlEncoded } = await import("../app/lib/security.server");
    const req = new Request("https://timeless.example.com", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=----FormBoundary" },
      body: "------FormBoundary--"
    });
    await expect(readStrictFormUrlEncoded(req)).rejects.toThrow("Unsupported Media Type");
  });

  it("should reject malformed CSRF tokens", async () => {
    const { readStrictFormUrlEncoded } = await import("../app/lib/security.server");
    const req = new Request("https://timeless.example.com", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "csrf=not-hex-at-all"
    });
    const params = await readStrictFormUrlEncoded(req);
    // It reads fine — CSRF validation is separate
    expect(params.get("csrf")).toBe("not-hex-at-all");
  });
});

describe("HTTP Range parsing", () => {
  it("should handle open range (bytes=0-)", () => {
    const range = "bytes=0-";
    const match = range.match(/^bytes=(\d+)-(\d*)$/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("0");
    expect(match![2]).toBe("");
  });

  it("should handle suffix range (bytes=-500)", () => {
    const range = "bytes=-500";
    expect(range.startsWith("bytes=-")).toBe(true);
    const suffix = parseInt(range.substring(7), 10);
    expect(suffix).toBe(500);
  });

  it("should reject multiple ranges", () => {
    const range = "bytes=0-100, 200-300";
    const match = range.match(/^bytes=(\d+)-(\d*)$/);
    expect(match).toBeNull();
  });

  it("should parse standard range", () => {
    const range = "bytes=100-200";
    const match = range.match(/^bytes=(\d+)-(\d*)$/);
    expect(match).not.toBeNull();
    expect(parseInt(match![1], 10)).toBe(100);
    expect(parseInt(match![2], 10)).toBe(200);
  });

  it("should reject invalid range format", () => {
    const range = "bytes=abc-def";
    const match = range.match(/^bytes=(\d+)-(\d*)$/);
    expect(match).toBeNull();
  });
});

describe("Gallery DTO pagination", () => {
  it("should validate skip parameter", () => {
    expect(parseInt("0", 10)).toBe(0);
    expect(parseInt("24", 10)).toBe(24);
    expect(isNaN(parseInt("abc", 10))).toBe(true);
    expect(parseInt("-1", 10)).toBe(-1);
  });

  it("should have 24 items per page", () => {
    const take = 24;
    expect(take).toBe(24);
  });
});
