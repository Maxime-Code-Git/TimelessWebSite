import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { action } from "../app/routes/api.admin.data-retention.booking-export";
import * as authServer from "../app/lib/auth.server";
import { openBookingDb } from "../app/lib/db-booking.server";
import * as securityServer from "../app/lib/security.server";
import * as dbBookingServer from "../app/lib/db-booking.server";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

vi.mock("../app/lib/auth.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/lib/auth.server")>();
  return {
    ...actual,
    requireAdminSession: vi.fn(),
  };
});

vi.mock("../app/lib/session.server", () => ({
  destroySession: vi.fn().mockResolvedValue("destroyed-cookie")
}));

vi.mock("../app/lib/security.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/lib/security.server")>();
  return {
    ...actual,
    validateOrigin: vi.fn(),
  };
});

vi.mock("../app/lib/db-booking.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/lib/db-booking.server")>();
  return {
    ...actual,
    getBookingDb: vi.fn(),
  };
});

describe("Booking Export Resource Route", () => {
  let db: DatabaseSync;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `booking-export-test-${crypto.randomUUID()}.sqlite`);
    db = openBookingDb(dbPath);
    vi.mocked(dbBookingServer.getBookingDb).mockReturnValue(db);

    const now = Date.now();
    const insertBooking = db.prepare(`
      INSERT INTO bookings (id, local_date, local_time, slot_key, starts_at_utc, ends_at_utc, timezone, status, names, email, language, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertBooking.run("book-1", "2024-01-01", "10:00", "slot-1", "2024-01-01T09:00:00Z", "2024-01-01T09:30:00Z", "Europe/Paris", "cancelled", "John Doe", "john@test.com", "fr", now, now);
  });

  afterEach(() => {
    if (db) db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    vi.resetAllMocks();
  });

  function mockValidSession() {
    vi.mocked(authServer.requireAdminSession).mockResolvedValue({
      isValid: true,
      session: { get: (k: string) => k === "csrfToken" ? "valid-csrf" : null } as unknown as import("react-router").Session
    });
    vi.mocked(securityServer.validateOrigin).mockReturnValue(true);
  }

  function createExportRequest(bodyObj: Record<string, string>, options?: { method?: string; contentType?: string; mockSession?: boolean }): Request {
    const method = options?.method ?? "POST";
    const contentType = options?.contentType ?? "application/x-www-form-urlencoded";
    const mockSession = options?.mockSession ?? true;

    if (mockSession) {
      mockValidSession();
    }

    const formData = new URLSearchParams();
    formData.set("csrfToken", "valid-csrf");
    for (const [k, v] of Object.entries(bodyObj)) formData.set(k, v);

    return new Request("http://localhost/api/admin/data-retention/booking-export", {
      method,
      headers: { "Content-Type": contentType },
      body: formData.toString()
    });
  }

  function callAction(req: Request) {
    return action({ request: req, params: {} } as unknown as import("react-router").ActionFunctionArgs);
  }

  // ── Method check ─────────────────────────────────────────

  it("méthode GET → 405 avec Allow: POST", async () => {
    const req = new Request("http://localhost/api/admin/data-retention/booking-export", {
      method: "GET"
    });
    const res = await callAction(req);
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  it("méthode PUT → 405", async () => {
    const req = new Request("http://localhost/api/admin/data-retention/booking-export", {
      method: "PUT",
      body: "id=book-1"
    });
    const res = await callAction(req);
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  // ── Session / Origin / CSRF ──────────────────────────────

  it("session admin absente → 302", async () => {
    vi.mocked(securityServer.validateOrigin).mockReturnValue(true);
    vi.mocked(authServer.requireAdminSession).mockResolvedValue({
      isValid: false,
      session: { get: () => null } as unknown as import("react-router").Session
    });
    const req = new Request("http://localhost/api/admin/data-retention/booking-export", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": "10"
      },
      body: "id=book-1"
    });
    const res = await callAction(req);
    expect(res.status).toBe(302);
  });

  it("Origin invalide → 403", async () => {
    vi.mocked(authServer.requireAdminSession).mockResolvedValue({
      isValid: true,
      session: { get: () => "valid-csrf" } as unknown as import("react-router").Session
    });
    vi.mocked(securityServer.validateOrigin).mockReturnValue(false);
    const req = new Request("http://localhost/api/admin/data-retention/booking-export", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": "0"
      }
    });
    const res = await callAction(req);
    expect(res.status).toBe(403);
  });

  it("CSRF absent → 403", async () => {
    vi.mocked(authServer.requireAdminSession).mockResolvedValue({
      isValid: true,
      session: { get: (k: string) => k === "csrfToken" ? "valid-csrf" : null } as unknown as import("react-router").Session
    });
    vi.mocked(securityServer.validateOrigin).mockReturnValue(true);

    const req = new Request("http://localhost/api/admin/data-retention/booking-export", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "id=book-1"
    });
    const res = await callAction(req);
    expect(res.status).toBe(403);
  });

  // ── Content-Type ─────────────────────────────────────────

  it("Content-Type incorrect → 415", async () => {
    vi.mocked(authServer.requireAdminSession).mockResolvedValue({
      isValid: true,
      session: { get: () => "valid-csrf" } as unknown as import("react-router").Session
    });
    vi.mocked(securityServer.validateOrigin).mockReturnValue(true);
    const req = new Request("http://localhost/api/admin/data-retention/booking-export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "2"
      },
      body: "{}"
    });
    const res = await callAction(req);
    expect(res.status).toBe(415);
  });

  // ── Payload ──────────────────────────────────────────────

  it("payload trop volumineux → 413", async () => {
    vi.mocked(securityServer.validateOrigin).mockReturnValue(true);
    vi.mocked(authServer.requireAdminSession).mockResolvedValue({
      isValid: true,
      session: { get: (k: string) => k === "csrfToken" ? "valid-csrf" : null } as unknown as import("react-router").Session
    });
    const req = new Request("http://localhost/api/admin/data-retention/booking-export", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": "999999"
      },
      body: "id=book-1"
    });
    const res = await callAction(req);
    expect(res.status).toBe(413);
  });

  // ── ID validation ────────────────────────────────────────

  it("ID invalide → 400", async () => {
    const req = createExportRequest({ id: "../../etc/passwd" });
    const res = await callAction(req);
    expect(res.status).toBe(400);
  });

  it("ID vide → 400", async () => {
    const req = createExportRequest({});
    const res = await callAction(req);
    expect(res.status).toBe(400);
  });

  // ── Not found ────────────────────────────────────────────

  it("rendez-vous absent → 404", async () => {
    const req = createExportRequest({ id: "nonexistent" });
    const res = await callAction(req);
    expect(res.status).toBe(404);
  });

  // ── Success ──────────────────────────────────────────────

  it("export réussi → 200 avec headers corrects", async () => {
    const req = createExportRequest({ id: "book-1" });
    const res = await callAction(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="booking_export.json"');
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(res.headers.get("X-Robots-Tag")).toContain("nofollow");
  });

  it("export contient l'identifiant et l'e-mail", async () => {
    const req = createExportRequest({ id: "book-1" });
    const res = await callAction(req);
    const json = await res.json();
    expect(json.id).toBe("book-1");
    expect(json.email).toBe("john@test.com");
  });

  it("export n'expose pas slot_key ni champs techniques", async () => {
    const req = createExportRequest({ id: "book-1" });
    const res = await callAction(req);
    const json = await res.json();
    expect(json.slot_key).toBeUndefined();
  });

  it("filename est neutre booking_export.json", async () => {
    const req = createExportRequest({ id: "book-1" });
    const res = await callAction(req);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="booking_export.json"');
  });

  // ── Security headers on all responses ────────────────────

  it("Cache-Control: no-store sur réponse de succès", async () => {
    const req = createExportRequest({ id: "book-1" });
    const res = await callAction(req);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("X-Robots-Tag présent sur réponse d'erreur", async () => {
    const req = createExportRequest({ id: "nonexistent" });
    const res = await callAction(req);
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
  });

  // ── SQLite error → generic response ──────────────────────

  it("erreur SQLite → réponse générique sans fuite interne", async () => {
    const fakeDb = {
      prepare: () => ({
        get: () => { throw new Error("SQLITE_CORRUPT: database disk image is malformed"); }
      })
    };
    vi.mocked(dbBookingServer.getBookingDb).mockReturnValue(fakeDb as unknown as import("node:sqlite").DatabaseSync);

    const req = createExportRequest({ id: "book-1" });
    const res = await callAction(req);
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain("SQLITE_CORRUPT");
    expect(body).not.toContain("database disk image");
    expect(body).toBe("Internal Server Error");
  });
});
