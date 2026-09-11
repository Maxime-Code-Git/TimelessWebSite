import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { execFile } from "node:child_process";
import { openBookingDb, closeBookingDb } from "../app/lib/db-booking.server";
import {
  getLocalDate, getUtcDate, isValidVisioUrl,
  createPendingBooking, updateBookingStatus,
  addBlockedDate, removeBlockedDate, getBlockedDates,
  toggleWeeklySlot, getWeeklySlots
} from "../app/lib/booking.server";
import { ENV } from "../app/lib/env.server";

vi.mock("../app/lib/env.server", () => ({
  ENV: {
    BOOKING_DB_PATH: "",
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

describe("Booking Server Logic & DB", () => {
  let dbPath: string;

  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-booking-"));
    dbPath = path.join(tmpDir, "booking.db");
    Object.assign(ENV, { BOOKING_DB_PATH: dbPath });
  });

  afterEach(() => {
    closeBookingDb();
    const dir = path.dirname(dbPath);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true });
    }
  });

  describe("Time and Date Calculations (Civil boundaries & DST)", () => {
    it("should correctly calculate local dates and handle timezone", () => {
      // 2026-09-10T10:00:00Z -> 12:00:00 local (DST)
      const d = new Date("2026-09-10T10:00:00Z");
      const local = getLocalDate(d, "Europe/Brussels");
      expect(local.dateStr).toBe("2026-09-10");
      expect(local.timeStr).toBe("12:00");
    });

    it("should survive DST transitions correctly (Summer -> Winter)", () => {
      // End of DST 2026 is Oct 25.
      const summerDate = getUtcDate("2026-10-24", "10:00", "Europe/Brussels");
      expect(summerDate.getUTCHours()).toBe(8); // UTC+2

      const winterDate = getUtcDate("2026-10-26", "10:00", "Europe/Brussels");
      expect(winterDate.getUTCHours()).toBe(9); // UTC+1
    });

    it("should reject invalid civil dates (Feb 30) instead of shifting into March", () => {
      // 2026-02-30 would normally shift to March 2 in JS `Date`. We expect our code to not shift it during civil validation.
      // But getUtcDate expects a valid string. If passed "2026-02-30", what happens?
      // It iterates and might fail. Let's see if it throws.
      expect(() => getUtcDate("2026-02-30", "10:00", "Europe/Brussels")).toThrow();
    });
  });

  describe("DB Migration & Permissions", () => {
    it("should migrate correctly by detecting duplicates before creating unique index", () => {
      // Create a raw DB and insert old structure data
      const rawDb = new DatabaseSync(dbPath);
      rawDb.exec(`
        CREATE TABLE IF NOT EXISTS weekly_slots (
          id TEXT PRIMARY KEY,
          weekday INTEGER NOT NULL,
          local_time TEXT NOT NULL,
          active INTEGER DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        PRAGMA user_version = 0;
      `);

      // Insert duplicate
      const now = Date.now();
      rawDb.prepare("INSERT INTO weekly_slots (id, weekday, local_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run("id1", 1, "10:00", now, now);
      rawDb.prepare("INSERT INTO weekly_slots (id, weekday, local_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run("id2", 1, "10:00", now, now);
      rawDb.close();

      // Now openBookingDb should throw due to duplicates
      expect(() => openBookingDb(dbPath)).toThrow("MIGRATION_FAILED: Duplicates exist in weekly_slots");

      // Now remove the duplicate
      const rawDb2 = new DatabaseSync(dbPath);
      rawDb2.prepare("DELETE FROM weekly_slots WHERE id = 'id2'").run();
      rawDb2.close();

      // Now openBookingDb should succeed and apply migration
      const db = openBookingDb(dbPath);
      expect(db).toBeInstanceOf(DatabaseSync);

      // Verify PRAGMA user_version is 1
      const version = db.prepare("PRAGMA user_version").get() as { user_version: number };
      expect(version.user_version).toBe(1);

      // Also check permissions
      const dirStat = fs.statSync(path.dirname(dbPath));
      expect(dirStat.mode & 0o777).toBe(0o700);

      const dbStat = fs.statSync(dbPath);
      expect(dbStat.mode & 0o777).toBe(0o600);

      db.close();
    });
  });

  describe("Concurrency with Workers", () => {
    it("should prevent double booking using worker threads targeting the same time slot", async () => {
      // Init first connection to setup the DB
      const db = openBookingDb(dbPath);
      // Wait for it to close so workers don't hit locked issues
      db.close();

      const data = {
        dbPath,
        date: "2026-09-15",
        time: "10:00",
        names: "Worker Test",
        email: "worker@test.com"
      };

      // Spawn two workers at the exact same time
      const runWorker = (d: typeof data) => {
        return new Promise((resolve, reject) => {
          const workerPath = path.join(__dirname, "booking-concurrency.worker.ts");

          execFile("npx", ["tsx", workerPath], {
            env: {
              ...process.env,
              NODE_ENV: "test",
              WORKER_DB_PATH: d.dbPath,
              WORKER_DATE: d.date,
              WORKER_TIME: d.time,
              WORKER_NAMES: d.names,
              WORKER_EMAIL: d.email,
              PUBLIC_SITE_URL: "https://example.com",
              SMTP_HOST: "localhost",
              SMTP_PORT: "2525",
              SMTP_USER: "test",
              SMTP_PASS: "test",
              SMTP_FROM: "f",
              SMTP_TO: "t",
              CONTACT_RATE_LIMIT_SECRET: "secret",
              RATE_LIMIT_DB_PATH: d.dbPath,
              BOOKING_DB_PATH: d.dbPath,
              PORTFOLIO_CONTENT_PATH: path.join(os.tmpdir(), "portfolio.json"),
              PORTFOLIO_MEDIA_PATH: path.join(os.tmpdir(), "portfolio"),
            }
          }, (err, stdout, stderr) => {
            if (err && err.code !== 0) {
              console.info("Exec error:", err);
            }
            try {
              const msg = JSON.parse(stdout.trim());
              resolve({ success: true, ...msg }); // msg already has success: true/false
            } catch (_e) {
              reject(new Error(`Failed to parse worker output: ${stdout} ${stderr}`, { cause: _e }));
            }
          });
        });
      };

      const results = await Promise.allSettled([
        runWorker({ ...data, names: "Alice", email: "alice@test.com" }),
        runWorker({ ...data, names: "Bob", email: "bob@test.com" })
      ]);

      let successCount = 0;
      let failureCount = 0;

      for (const r of results) {
        if (r.status === 'fulfilled') {
          const msg = r.value as { success: boolean, error?: string };
          if (msg.success) successCount++;
          else {
            failureCount++;
            expect(msg.error).toContain("ALREADY_BOOKED");
          }
        } else {
          console.info("Worker rejected:", r.reason);
        }
      }

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      // Verify db has only 1 booking
      const checkDb = openBookingDb(dbPath);
      const rows = checkDb.prepare("SELECT * FROM bookings").all();
      expect(rows.length).toBe(1);
      checkDb.close();
    });
  });

  describe("Booking State Machine", () => {
    it("should respect booking status transitions", () => {
      const db = openBookingDb(dbPath);
      const b = createPendingBooking({ date: "2026-09-15", time: "10:00", names: "User", email: "u@t.c", language: "fr" }, db);

      const confirmed = updateBookingStatus(b.id, "confirmed", "https://meet.google.com/abc", undefined, db);
      expect(confirmed.status).toBe("confirmed");

      expect(() => updateBookingStatus(b.id, "confirmed", "https://meet.google.com/def", undefined, db)).toThrow("already confirmed");

      expect(() => updateBookingStatus(b.id, "rejected", undefined, undefined, db)).toThrow("Cannot reject a confirmed booking. Cancel it instead.");

      const cancelled = updateBookingStatus(b.id, "cancelled", undefined, undefined, db);
      expect(cancelled.status).toBe("cancelled");

      expect(() => updateBookingStatus(b.id, "rejected", undefined, undefined, db)).toThrow("Cannot modify a rejected or cancelled");
      db.close();
    });
  });

  describe("Visio URL Validator", () => {
    it("should accept valid URLs and reject invalid ones", () => {
      expect(isValidVisioUrl("https://meet.google.com/abc-defg-hij")).toBe(true);
      expect(isValidVisioUrl("https://zoom.us/j/12345")).toBe(true);
      expect(isValidVisioUrl("https://teams.microsoft.com/l/meetup-join/19")).toBe(true);
      expect(isValidVisioUrl("http://meet.google.com/abc")).toBe(false); // No HTTP
      expect(isValidVisioUrl("https://malicious.com/meet.google.com")).toBe(false);
      expect(isValidVisioUrl("https://user:pass@meet.google.com/abc")).toBe(false); // No credentials
    });
  });

  describe("CRUD Schedules & Blocked Dates", () => {
    it("should allow managing blocked dates", () => {
      const db = openBookingDb(dbPath);
      addBlockedDate("2026-12-25", "Noël", db);
      const dates = getBlockedDates(db);
      expect(dates.length).toBe(1);
      expect(dates[0].local_date).toBe("2026-12-25");
      expect(dates[0].reason).toBe("Noël");

      removeBlockedDate(dates[0].id, db);
      expect(getBlockedDates(db).length).toBe(0);
      db.close();
    });

    it("should allow toggling weekly slots", () => {
      const db = openBookingDb(dbPath);
      const slots = getWeeklySlots(db);
      expect(slots.length).toBeGreaterThan(0);
      const slotId = slots[0].id;
      const initialStatus = slots[0].active;

      toggleWeeklySlot(slotId, db);
      const toggled = getWeeklySlots(db).find(s => s.id === slotId)!;
      expect(!!toggled.active).toBe(!initialStatus);
      db.close();
    });
  });

});
