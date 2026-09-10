import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import crypto from "node:crypto";
import { ENV } from "./env.server";

let db: DatabaseSync | undefined;

export function initBookingDb(): DatabaseSync {
  if (db) return db;
  const dbPath = ENV.BOOKING_DB_PATH;

  if (process.env.NODE_ENV === "test") {
    const resolved = path.resolve(dbPath);
    const tmp = os.tmpdir();
    const relTmp = path.relative(tmp, resolved);
    if (relTmp.startsWith("..") || path.isAbsolute(relTmp)) {
      throw new Error(`CRITICAL: BOOKING_DB_PATH must be under os.tmpdir() in tests.`);
    }
  }

  // Ensure directory exists with 0700
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  db = new DatabaseSync(dbPath);

  // Always ensure 0600
  fs.chmodSync(dbPath, 0o600);

  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA journal_mode = WAL;");

  db.exec("BEGIN EXCLUSIVE TRANSACTION;");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS booking_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        timezone TEXT NOT NULL DEFAULT 'Europe/Brussels',
        duration_minutes INTEGER NOT NULL DEFAULT 30,
        buffer_minutes INTEGER NOT NULL DEFAULT 15,
        minimum_notice_hours INTEGER NOT NULL DEFAULT 48,
        booking_window_weeks INTEGER NOT NULL DEFAULT 8
      );
      
      INSERT OR IGNORE INTO booking_settings (id) VALUES (1);

      CREATE TABLE IF NOT EXISTS weekly_slots (
        id TEXT PRIMARY KEY,
        weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
        local_time TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS blocked_dates (
        id TEXT PRIMARY KEY,
        local_date TEXT NOT NULL UNIQUE,
        reason TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        local_date TEXT NOT NULL,
        local_time TEXT NOT NULL,
        slot_key TEXT NOT NULL,
        starts_at_utc TEXT NOT NULL,
        ends_at_utc TEXT NOT NULL,
        timezone TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
        names TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        wedding_date TEXT,
        formula TEXT,
        message TEXT,
        language TEXT NOT NULL CHECK (language IN ('fr', 'en')),
        meeting_url TEXT,
        admin_note TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot_key_active 
      ON bookings(slot_key) 
      WHERE status IN ('pending', 'confirmed');
    `);

    // Pre-fill default slots idempotently if weekly_slots is empty
    const countStmt = db.prepare("SELECT COUNT(*) as c FROM weekly_slots");
    const count = (countStmt.get() as { c: number }).c;
    
    if (count === 0) {
      const now = Date.now();
      const insertSlot = db.prepare("INSERT INTO weekly_slots (id, weekday, local_time, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)");
      insertSlot.run(crypto.randomUUID(), 2, "10:00", now, now);
      insertSlot.run(crypto.randomUUID(), 2, "18:00", now, now);
      insertSlot.run(crypto.randomUUID(), 4, "10:00", now, now);
      insertSlot.run(crypto.randomUUID(), 4, "18:00", now, now);
    }

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return db;
}

export function closeBookingDb(): void {
  if (!db) return;
  db.close();
  db = undefined;
}

if (typeof process !== 'undefined') {
  process.on('SIGINT', () => { closeBookingDb(); });
  process.on('SIGTERM', () => { closeBookingDb(); });
}
