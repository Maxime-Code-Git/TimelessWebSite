import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { action } from "../app/routes/admin.data-retention";
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

describe("Admin Data Retention Booking API", () => {
  let db: DatabaseSync;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `booking-test-${crypto.randomUUID()}.sqlite`);
    db = openBookingDb(dbPath);
    vi.mocked(dbBookingServer.getBookingDb).mockReturnValue(db);

    const now = Date.now();
    const insertBooking = db.prepare(`
      INSERT INTO bookings (id, local_date, local_time, slot_key, starts_at_utc, ends_at_utc, timezone, status, names, email, language, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Past cancelled
    insertBooking.run("book-1", "2024-01-01", "10:00", "slot-1", "2024-01-01T09:00:00Z", "2024-01-01T09:30:00Z", "Europe/Paris", "cancelled", "John Doe", "john@test.com", "fr", now, now);

    // Future confirmed
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    insertBooking.run("book-2", futureDate.toISOString().split("T")[0], "14:00", "slot-2", futureDate.toISOString(), futureDate.toISOString(), "Europe/Paris", "confirmed", "Jane Doe", "jane@test.com", "en", now, now);

    // Past confirmed (for bulk tests)
    insertBooking.run("book-3", "2024-03-01", "09:00", "slot-3", "2024-03-01T08:00:00Z", "2024-03-01T08:30:00Z", "Europe/Paris", "confirmed", "Bob Test", "bob@test.com", "fr", now, now);
  });

  afterEach(() => {
    if (db) db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    vi.resetAllMocks();
  });

  function createRequest(intent: string, bodyObj: Record<string, string>, mockSession = true): Request {
    if (mockSession) {
      vi.mocked(authServer.requireAdminSession).mockResolvedValue({
        isValid: true,
        session: { get: (k: string) => k === "csrfToken" ? "valid-csrf" : null } as unknown as import("react-router").Session
      });
      vi.mocked(securityServer.validateOrigin).mockReturnValue(true);
    }

    const formData = new URLSearchParams();
    formData.set("intent", intent);
    formData.set("csrfToken", "valid-csrf");
    for (const [k, v] of Object.entries(bodyObj)) formData.set(k, v);

    return new Request("http://localhost/admin/data-retention", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString()
    });
  }

  function callAction(req: Request) {
    return action({ request: req, params: {} } as unknown as import("react-router").ActionFunctionArgs);
  }

  // ── Session / Origin / CSRF ──────────────────────────────

  it("session admin absente → 401", async () => {
    vi.mocked(securityServer.validateOrigin).mockReturnValue(true);
    vi.mocked(authServer.requireAdminSession).mockResolvedValue({
      isValid: false,
      session: { get: () => null } as unknown as import("react-router").Session
    });
    const req = new Request("http://localhost/admin/data-retention", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "intent=export_booking"
    });
    const res = await callAction(req);
    expect(res.status).toBe(401);
  });

  it("Origin invalide → 403", async () => {
    vi.mocked(securityServer.validateOrigin).mockReturnValue(false);
    const req = new Request("http://localhost/admin/data-retention", { method: "POST" });
    const res = await callAction(req);
    expect(res.status).toBe(403);
  });

  it("CSRF absent → 403", async () => {
    vi.mocked(authServer.requireAdminSession).mockResolvedValue({
      isValid: true,
      session: { get: (k: string) => k === "csrfToken" ? "valid-csrf" : null } as unknown as import("react-router").Session
    });
    vi.mocked(securityServer.validateOrigin).mockReturnValue(true);

    const formData = new URLSearchParams();
    formData.set("intent", "delete_booking_single");
    formData.set("id", "book-1");
    formData.set("confirm", "SUPPRIMER");
    // No CSRF

    const req = new Request("http://localhost/admin/data-retention", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString()
    });
    const res = await callAction(req);
    expect(res.status).toBe(403);
  });

  it("Content-Type invalide → 415", async () => {
    vi.mocked(securityServer.validateOrigin).mockReturnValue(true);
    const req = new Request("http://localhost/admin/data-retention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    const res = await callAction(req);
    expect(res.status).toBe(415);
  });

  it("Content-Length non numérique → 400", async () => {
    vi.mocked(securityServer.validateOrigin).mockReturnValue(true);
    vi.mocked(authServer.requireAdminSession).mockResolvedValue({
      isValid: true,
      session: { get: (k: string) => k === "csrfToken" ? "valid-csrf" : null } as unknown as import("react-router").Session
    });
    const req = new Request("http://localhost/admin/data-retention", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": "abc"
      },
      body: "intent=export_booking"
    });
    const res = await callAction(req);
    expect(res.status).toBe(400);
  });

  it("Content-Length trop grand → 413", async () => {
    vi.mocked(securityServer.validateOrigin).mockReturnValue(true);
    vi.mocked(authServer.requireAdminSession).mockResolvedValue({
      isValid: true,
      session: { get: (k: string) => k === "csrfToken" ? "valid-csrf" : null } as unknown as import("react-router").Session
    });
    const req = new Request("http://localhost/admin/data-retention", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": "999999"
      },
      body: "intent=export_booking"
    });
    const res = await callAction(req);
    expect(res.status).toBe(413);
  });

  it("intention inconnue → 400", async () => {
    const req = createRequest("unknown_intent", {});
    const res = await callAction(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Unknown intent");
  });

  // ── Export booking ───────────────────────────────────────

  it("export d'un rendez-vous avec liste blanche de colonnes", async () => {
    const req = createRequest("export_booking", { id: "book-1" });
    const res = await callAction(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    // Filename must be neutral (no name, no email, no personal ID)
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="booking_export.json"');
    const json = await res.json();
    expect(json.id).toBe("book-1");
    expect(json.email).toBe("john@test.com");
    // Must NOT include technical fields like slot_key
    expect(json.slot_key).toBeUndefined();
  });

  it("export rendez-vous inexistant → 404", async () => {
    const req = createRequest("export_booking", { id: "unknown" });
    const res = await callAction(req);
    expect(res.status).toBe(404);
  });

  // ── Delete booking single ──────────────────────────────

  it("suppression individuelle réussie", async () => {
    const req = createRequest("delete_booking_single", { id: "book-1", confirm: "SUPPRIMER" });
    const res = await callAction(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deletedCount).toBe(1);
    expect(db.prepare("SELECT * FROM bookings WHERE id = ?").get("book-1")).toBeUndefined();
  });

  it("suppression inexistante → 404", async () => {
    const req = createRequest("delete_booking_single", { id: "unknown", confirm: "SUPPRIMER" });
    const res = await callAction(req);
    expect(res.status).toBe(404);
  });

  it("suppression d'un rendez-vous futur confirmé → 400", async () => {
    const req = createRequest("delete_booking_single", { id: "book-2", confirm: "SUPPRIMER" });
    const res = await callAction(req);
    expect(res.status).toBe(400);
    expect(db.prepare("SELECT * FROM bookings WHERE id = ?").get("book-2")).toBeDefined();
  });

  it("confirmation incorrecte → 400", async () => {
    const req = createRequest("delete_booking_single", { id: "book-1", confirm: "WRONG" });
    const res = await callAction(req);
    expect(res.status).toBe(400);
  });

  // ── Delete booking bulk ────────────────────────────────

  it("suppression groupée limitée à la sélection exacte", async () => {
    const req = createRequest("delete_booking_bulk", {
      ids: JSON.stringify(["book-1", "book-3"]),
      confirm: "SUPPRIMER"
    });
    const res = await callAction(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deletedCount).toBe(2);
    expect(db.prepare("SELECT * FROM bookings WHERE id = ?").get("book-1")).toBeUndefined();
    expect(db.prepare("SELECT * FROM bookings WHERE id = ?").get("book-3")).toBeUndefined();
    // book-2 intact
    expect(db.prepare("SELECT * FROM bookings WHERE id = ?").get("book-2")).toBeDefined();
  });

  it("rendez-vous futur protégé dans le lot → 400", async () => {
    const req = createRequest("delete_booking_bulk", { ids: JSON.stringify(["book-2"]), confirm: "SUPPRIMER" });
    const res = await callAction(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Impossible de supprimer le rendez-vous futur");
    expect(db.prepare("SELECT * FROM bookings WHERE id = ?").get("book-2")).toBeDefined();
  });

  it("identifiant inconnu dans le lot → 404", async () => {
    const req = createRequest("delete_booking_bulk", {
      ids: JSON.stringify(["book-1", "nonexistent"]),
      confirm: "SUPPRIMER"
    });
    const res = await callAction(req);
    expect(res.status).toBe(404);
  });

  it("tableau vide → 400", async () => {
    const req = createRequest("delete_booking_bulk", { ids: JSON.stringify([]), confirm: "SUPPRIMER" });
    const res = await callAction(req);
    expect(res.status).toBe(400);
  });

  it("tableau dupliqué → 400", async () => {
    const req = createRequest("delete_booking_bulk", { ids: JSON.stringify(["book-1", "book-1"]), confirm: "SUPPRIMER" });
    const res = await callAction(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("dupliqués");
  });

  it("tableau trop grand → 400", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `id-${i}`);
    const req = createRequest("delete_booking_bulk", { ids: JSON.stringify(ids), confirm: "SUPPRIMER" });
    const res = await callAction(req);
    expect(res.status).toBe(400);
  });

  it("tableau contenant autre chose que des chaînes → 400", async () => {
    const req = createRequest("delete_booking_bulk", { ids: "[1, 2, 3]", confirm: "SUPPRIMER" });
    const res = await callAction(req);
    expect(res.status).toBe(400);
  });

  it("corps malformé (JSON invalide) → 400", async () => {
    const req = createRequest("delete_booking_bulk", { ids: "not-json", confirm: "SUPPRIMER" });
    const res = await callAction(req);
    expect(res.status).toBe(400);
  });

  // ── Response safety ────────────────────────────────────

  it("les réponses d'erreur ne contiennent ni chemin absolu ni erreur brute", async () => {
    const fakeDb = {
      prepare: () => ({
        run: () => { throw new Error("SQLITE_CONSTRAINT: unique constraint failed"); },
        get: () => ({ id: "book-1", status: "cancelled", starts_at_utc: "2020-01-01T00:00:00Z" })
      }),
      exec: vi.fn()
    };
    vi.mocked(dbBookingServer.getBookingDb).mockReturnValue(fakeDb as unknown as import("node:sqlite").DatabaseSync);

    const req = createRequest("delete_booking_single", { id: "book-1", confirm: "SUPPRIMER" });
    const res = await callAction(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    // Should NOT contain raw error details
    expect(json.error).not.toContain("SQLITE_CONSTRAINT");
    expect(json.error).not.toContain("unique constraint");
  });

  it("Cache-Control: no-store est présent sur toutes les réponses", async () => {
    const req = createRequest("export_booking", { id: "book-1" });
    const res = await callAction(req);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const req2 = createRequest("delete_booking_single", { id: "unknown", confirm: "SUPPRIMER" });
    const res2 = await callAction(req2);
    expect(res2.headers.get("Cache-Control")).toContain("no-store");
  });

  it("X-Robots-Tag présent sur les réponses d'erreur", async () => {
    const req = createRequest("unknown_intent", {});
    const res = await callAction(req);
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
  });
});
