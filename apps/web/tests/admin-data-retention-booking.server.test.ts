
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
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    requireAdminSession: vi.fn(),
  };
});

vi.mock("../app/lib/security.server", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    validateOrigin: vi.fn(),
  };
});

vi.mock("../app/lib/db-booking.server", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
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
    // Insert some mock bookings
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
  });

  afterEach(() => {
    if (db) db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    vi.resetAllMocks();
  });

  function createRequest(intent: string, bodyObj: Record<string, string>, mockSession = true) {
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

  it("export d'un rendez-vous autorisé", async () => {
    const req = createRequest("export_booking", { id: "book-1" });
    const res = await action({ request: req, params: {}} as unknown as import("react-router").ActionFunctionArgs);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const json = await res.json();
    expect(json.id).toBe("book-1");
    expect(json.email).toBe("john@test.com");
  });

  it("export d'un autre rendez-vous impossible", async () => {
    const req = createRequest("export_booking", { id: "unknown" });
    const res = await action({ request: req, params: {}} as unknown as import("react-router").ActionFunctionArgs);
    expect(res.status).toBe(404);
  });

  it("suppression individuelle réussie", async () => {
    const req = createRequest("delete_booking_single", { id: "book-1", confirm: "SUPPRIMER" });
    const res = await action({ request: req, params: {}} as unknown as import("react-router").ActionFunctionArgs);
    expect(res.status).toBe(200);
    const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get("book-1");
    expect(booking).toBeUndefined();
  });

  it("suppression inexistante en 404", async () => {
    const req = createRequest("delete_booking_single", { id: "unknown", confirm: "SUPPRIMER" });
    const res = await action({ request: req, params: {}} as unknown as import("react-router").ActionFunctionArgs);
    expect(res.status).toBe(404);
  });

  it("suppression groupée strictement limitée à la sélection", async () => {
    const req = createRequest("delete_booking_bulk", { ids: JSON.stringify(["book-1", "unknown"]), confirm: "SUPPRIMER" });
    const res = await action({ request: req, params: {}} as unknown as import("react-router").ActionFunctionArgs);
    expect(res.status).toBe(200);
    expect(db.prepare("SELECT * FROM bookings WHERE id = ?").get("book-1")).toBeUndefined();
    expect(db.prepare("SELECT * FROM bookings WHERE id = ?").get("book-2")).toBeDefined();
  });

  it("protection d'un rendez-vous futur non sélectionné (et sélectionné)", async () => {
    const req = createRequest("delete_booking_bulk", { ids: JSON.stringify(["book-2"]), confirm: "SUPPRIMER" });
    const res = await action({ request: req, params: {}} as unknown as import("react-router").ActionFunctionArgs);
    expect(res.status).toBe(400); // Should refuse to bulk delete a future confirmed booking
    const json = await res.json();
    expect(json.error).toContain("Impossible de supprimer le rendez-vous futur");
    expect(db.prepare("SELECT * FROM bookings WHERE id = ?").get("book-2")).toBeDefined();
  });

  it("CSRF absent ou invalide", async () => {
    vi.mocked(authServer.requireAdminSession).mockResolvedValue({
      isValid: true,
      session: { get: (k: string) => k === "csrfToken" ? "valid-csrf" : null } as unknown as import("react-router").Session
    });
    vi.mocked(securityServer.validateOrigin).mockReturnValue(true);
    
    const formData = new URLSearchParams();
    formData.set("intent", "delete_booking_single");
    formData.set("id", "book-1");
    formData.set("confirm", "SUPPRIMER");
    // No CSRF in formData

    const req = new Request("http://localhost/admin/data-retention", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString()
    });

    const res = await action({ request: req, params: {}} as unknown as import("react-router").ActionFunctionArgs);
    expect(res.status).toBe(403);
  });

  it("Origin invalide", async () => {
    vi.mocked(securityServer.validateOrigin).mockReturnValue(false);
    const req = new Request("http://localhost/admin/data-retention", { method: "POST" });
    const res = await action({ request: req, params: {}} as unknown as import("react-router").ActionFunctionArgs);
    expect(res.status).toBe(403);
  });

  it("session administrateur absente", async () => {
    vi.mocked(securityServer.validateOrigin).mockReturnValue(true);
    vi.mocked(authServer.requireAdminSession).mockResolvedValue({ isValid: false, session: {} as unknown as import("react-router").Session });
    
    const req = new Request("http://localhost/admin/data-retention", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    const res = await action({ request: req, params: {}} as unknown as import("react-router").ActionFunctionArgs);
    expect(res.status).toBe(401); // Content-Type is valid, should fail at auth
    // Wait, the body needs to be present and parsed.
  });
  
  it("session admin absente with valid body", async () => {
    vi.mocked(securityServer.validateOrigin).mockReturnValue(true);
    vi.mocked(authServer.requireAdminSession).mockResolvedValue({ isValid: false, session: {} as unknown as import("react-router").Session });
    
    const req = new Request("http://localhost/admin/data-retention", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "intent=export_booking"
    });
    const res = await action({ request: req, params: {}} as unknown as import("react-router").ActionFunctionArgs);
    expect(res.status).toBe(401);
  });

  it("rollback sur erreur SQLite", async () => {
    // Mock getBookingDb to throw on run
    const fakeDb = {
      prepare: () => ({
        run: () => { throw new Error("SQL error") }
      }),
      exec: vi.fn()
    };
    vi.mocked(dbBookingServer.getBookingDb).mockReturnValue(fakeDb as unknown as import("node:sqlite").DatabaseSync);
    
    const req = createRequest("delete_booking_single", { id: "book-1", confirm: "SUPPRIMER" });
    const res = await action({ request: req, params: {}} as unknown as import("react-router").ActionFunctionArgs);
    expect(res.status).toBe(500);
    expect(fakeDb.exec).toHaveBeenCalledWith("ROLLBACK;");
  });
});
