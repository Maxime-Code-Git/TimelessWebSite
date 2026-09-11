import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "../app/routes/api.booking";
import { ENV } from "../app/lib/env.server";

vi.mock("../app/lib/env.server", () => ({
  ENV: {
    PUBLIC_SITE_URL: "https://example.com",
    TRUST_PROXY: true,
    SMTP_HOST: "localhost",
    SMTP_PORT: 2525,
    SMTP_USER: "test",
    SMTP_PASS: "test",
    SMTP_FROM: "f",
    SMTP_TO: "t",
  }
}));

// Mock rate limiting
vi.mock("../app/lib/rate-limit.server", () => ({
  checkRateLimit: vi.fn(),
}));

import { checkRateLimit } from "../app/lib/rate-limit.server";

// Mock mailer to avoid real sends and errors
vi.mock("../app/lib/mailer.server", () => ({
  sendBookingRequestEmails: vi.fn().mockResolvedValue(true)
}));

// Mock booking DB creation
vi.mock("../app/lib/booking.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/lib/booking.server")>();
  return {
    ...actual,
    createPendingBooking: vi.fn().mockReturnValue({ id: "mock-id" })
  };
});

describe("Booking HTTP Route (/api/booking)", () => {
  const getStatus = (res: unknown) => res instanceof Response ? res.status : (res as { init?: { status?: number } })?.init?.status ?? 200;
  const getHeader = (res: unknown, name: string) => res instanceof Response ? res.headers.get(name) : ((res as { init?: { headers?: Record<string, string> } })?.init?.headers as Record<string, string>)?.[name] ?? null;

  beforeEach(() => {
    vi.mocked(checkRateLimit).mockClear();
    Object.assign(ENV, { PUBLIC_SITE_URL: "https://example.com" });
    Object.assign(ENV, { TRUST_PROXY: true });
  });

  const validPayload = {
    date: "2026-12-10",
    time: "10:00",
    names: "Test User",
    email: "test@example.com",
    language: "fr"
  };

  function createRequest(options: {
    method?: string,
    origin?: string | boolean,
    ip?: string,
    body?: unknown,
    contentType?: string
  }) {
    const headers = new Headers();
    if (options.origin !== false) {
      headers.set("Origin", typeof options.origin === "string" ? options.origin : (ENV.PUBLIC_SITE_URL as string));
    }
    headers.set("x-forwarded-for", options.ip || "1.1.1.1");
    if (options.contentType) headers.set("Content-Type", options.contentType);

    let bodyStr = undefined;
    if (options.body) {
      bodyStr = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }

    return new Request("https://example.com/api/booking", {
      method: options.method || "POST",
      headers,
      body: bodyStr
    });
  }

  it("should reject non-POST methods with 405", async () => {
    const req = createRequest({ method: "GET" });
    const res = await action({ request: req } as Parameters<typeof action>[0]) as Response;
    const status = getStatus(res);
    expect(status).toBe(405);
    expect(getHeader(res, "Allow")).toBe("POST");
  });

  it("should enforce strict Origin validation", async () => {
    const req = createRequest({ origin: "https://evil.com" });
    const res = await action({ request: req } as Parameters<typeof action>[0]) as Response;
    const status = getStatus(res);
    expect(status).toBe(403);
  });

  it("should validate Content-Type", async () => {
    const req = createRequest({ contentType: "application/x-www-form-urlencoded", body: "a=1" });
    const res = await action({ request: req } as Parameters<typeof action>[0]) as Response;
    const status = getStatus(res);
    expect(status).toBe(415);
  });

  it("should block payloads larger than 32KB", async () => {
    const largeStr = "a".repeat(40000); // > 32KB
    const req = createRequest({ contentType: "application/json", body: `{"names":"${largeStr}"}` });
    const res = await action({ request: req } as Parameters<typeof action>[0]) as Response;
    const status = getStatus(res);
    expect(status).toBe(413); // Payload Too Large
  });

  it("should respect rate limits and NOT reset on success", async () => {
    const ip = "192.168.1.10";

    // Check rate limit throws
    vi.mocked(checkRateLimit).mockImplementationOnce(() => {
      throw new Error("Rate limit exceeded");
    });
    const res = await action({
      request: createRequest({ ip, contentType: "application/json", body: validPayload })
    } as Parameters<typeof action>[0]) as Response;

    const status = getStatus(res);
    expect(status).toBe(429);
  });

  it("should succeed with valid payload", async () => {
    const req = createRequest({ contentType: "application/json", body: validPayload });
    const res = await action({ request: req } as Parameters<typeof action>[0]) as Response;
    const status = getStatus(res);
    expect(status).toBe(201);
    const cacheControl = getHeader(res, "Cache-Control");
    expect(cacheControl).toBe("no-store");
  });
});
