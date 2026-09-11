import { describe, it, expect, vi, beforeEach } from "vitest";
import { action, loader } from "../app/routes/admin.bookings";
import { requireValidAdminSession } from "../app/lib/admin-auth.server";
import type { Session } from "react-router";

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

vi.mock("../app/lib/admin-auth.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/lib/admin-auth.server")>();
  return {
    ...actual,
    requireValidAdminSession: vi.fn(),
    validateAdminFormData: vi.fn(async (req: Request) => await req.formData()),
  };
});

vi.mock("../app/lib/booking.server", async () => {
  return {
    getAllBookings: vi.fn().mockReturnValue([]),
    getWeeklySlots: vi.fn().mockReturnValue([]),
    getBlockedDates: vi.fn().mockReturnValue([]),
    updateBookingStatus: vi.fn().mockReturnValue({ id: "mock", language: "fr", email: "a@b.c" }),
    isValidVisioUrl: vi.fn().mockReturnValue(true),
    toggleWeeklySlot: vi.fn(),
    addBlockedDate: vi.fn(),
    removeBlockedDate: vi.fn(),
    getBooking: vi.fn().mockReturnValue({ id: "mock" })
  };
});

vi.mock("../app/lib/mailer.server", () => ({
  sendBookingConfirmedEmail: vi.fn().mockResolvedValue(true),
  sendBookingStatusEmail: vi.fn().mockResolvedValue(true)
}));

describe("Admin Booking HTTP", () => {
  let mockSession: Session;

  beforeEach(() => {
    mockSession = {
      id: "test-session",
      data: {
        adminId: "admin-123",
        credentialVersion: 1,
        csrfToken: "test-csrf-token",
      },
      has: vi.fn((key) => key in mockSession.data),
      get: vi.fn((key) => mockSession.data[key]),
      set: vi.fn(),
      flash: vi.fn(),
      unset: vi.fn(),
    } as Pick<Session, "id" | "data" | "has" | "get" | "set" | "flash" | "unset"> as Session;

    vi.mocked(requireValidAdminSession).mockResolvedValue(mockSession);
  });

  function createRequest(intent: string, body: Record<string, string>, method = "POST") {
    const params = new URLSearchParams();
    params.append("intent", intent);
    params.append("csrfToken", "test-csrf-token");
    for (const [k, v] of Object.entries(body)) {
      params.append(k, v);
    }

    const req = new Request("https://example.com/admin/bookings", {
      method,
      body: params.toString(),
    });
    req.headers.set("Origin", "https://example.com");
    req.headers.set("Content-Type", "application/x-www-form-urlencoded");
    return req;
  }

  it("should block unauthenticated access", async () => {
    vi.mocked(requireValidAdminSession).mockRejectedValueOnce(new Response("Unauthorized", { status: 401 }));
    const req = new Request("https://example.com/admin/bookings");
    await expect(loader({ request: req } as Parameters<typeof loader>[0])).rejects.toBeInstanceOf(Response);
  });

  it("should process confirm_booking intent", async () => {
    const req = createRequest("confirm_booking", {
      id: "booking-123",
      meeting_url: "https://meet.google.com/abc"
    });
    const res = await action({ request: req } as Parameters<typeof action>[0]) as Response;
    const status = res.status;
    expect(status).toBe(200);
  });

  it("should process reject_booking intent", async () => {
    const req = createRequest("reject_booking", {
      id: "booking-123",
      admin_note: "Sorry"
    });
    const res = await action({ request: req } as Parameters<typeof action>[0]) as Response;
    const status = res.status;
    expect(status).toBe(200);
  });
});
