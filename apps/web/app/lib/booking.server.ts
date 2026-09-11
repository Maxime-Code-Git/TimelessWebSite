import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getBookingDb } from "./db-booking.server";

export interface BookingSettings {
  timezone: string;
  duration_minutes: number;
  buffer_minutes: number;
  minimum_notice_hours: number;
  booking_window_weeks: number;
}

export interface WeeklySlot {
  id: string;
  weekday: number;
  local_time: string;
  active: boolean;
}

export interface BlockedDate {
  id: string;
  local_date: string;
  reason: string | null;
}

export interface Booking {
  id: string;
  local_date: string;
  local_time: string;
  slot_key: string;
  starts_at_utc: string;
  ends_at_utc: string;
  timezone: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled';
  names: string;
  email: string;
  phone: string | null;
  wedding_date: string | null;
  formula: string | null;
  message: string | null;
  language: 'fr' | 'en';
  meeting_url: string | null;
  admin_note: string | null;
  created_at: number;
}

function parseSettingsRow(row: Record<string, unknown>): BookingSettings {
  return {
    timezone: String(row.timezone),
    duration_minutes: Number(row.duration_minutes),
    buffer_minutes: Number(row.buffer_minutes),
    minimum_notice_hours: Number(row.minimum_notice_hours),
    booking_window_weeks: Number(row.booking_window_weeks)
  };
}

function parseWeeklySlotRow(row: Record<string, unknown>): WeeklySlot {
  return {
    id: String(row.id),
    weekday: Number(row.weekday),
    local_time: String(row.local_time),
    active: Boolean(row.active)
  };
}

function parseBlockedDateRow(row: Record<string, unknown>): BlockedDate {
  return {
    id: String(row.id),
    local_date: String(row.local_date),
    reason: row.reason ? String(row.reason) : null
  };
}

function parseBookingRow(row: Record<string, unknown>): Booking {
  return {
    id: String(row.id),
    local_date: String(row.local_date),
    local_time: String(row.local_time),
    slot_key: String(row.slot_key),
    starts_at_utc: String(row.starts_at_utc),
    ends_at_utc: String(row.ends_at_utc),
    timezone: String(row.timezone),
    status: row.status as Booking['status'],
    names: String(row.names),
    email: String(row.email),
    phone: row.phone ? String(row.phone) : null,
    wedding_date: row.wedding_date ? String(row.wedding_date) : null,
    formula: row.formula ? String(row.formula) : null,
    message: row.message ? String(row.message) : null,
    language: row.language as Booking['language'],
    meeting_url: row.meeting_url ? String(row.meeting_url) : null,
    admin_note: row.admin_note ? String(row.admin_note) : null,
    created_at: Number(row.created_at)
  };
}

function getSettings(db: DatabaseSync): BookingSettings {
  const row = db.prepare("SELECT * FROM booking_settings WHERE id = 1").get() as Record<string, unknown>;
  return parseSettingsRow(row);
}

// Convert UTC Date to local Brussels date strings
export function getLocalDate(d: Date, timeZone: string): { dateStr: string, timeStr: string, weekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", weekday: "short", hour12: false
  }).formatToParts(d);

  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));

  let hour = Number(p.hour);
  if (hour === 24) hour = 0;

  const dateStr = `${p.year}-${p.month.padStart(2, '0')}-${p.day.padStart(2, '0')}`;
  const timeStr = `${hour.toString().padStart(2, '0')}:${p.minute.padStart(2, '0')}`;

  // Weekday 1-7 (Monday-Sunday)
  const wMap: Record<string, number> = { "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6, "Sun": 7 };
  const weekday = wMap[p.weekday] || 1;

  return { dateStr, timeStr, weekday };
}

// Resolve Brussels local time back to UTC Date
export function getUtcDate(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);

  for (let offset = -1; offset <= 3; offset++) {
    const d = new Date(Date.UTC(year, month - 1, day, hour - offset, minute, 0));
    const check = getLocalDate(d, timeZone);
    if (check.dateStr === dateStr && check.timeStr === timeStr) {
      return d;
    }
  }
  throw new Error(`Invalid local date/time: ${dateStr} ${timeStr} in ${timeZone}`);
}

function dateStrToDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getAvailableSlots(db: DatabaseSync = getBookingDb(), nowMs: number = Date.now()) {
  const settings = getSettings(db);

  const weeklyRows = (db.prepare("SELECT * FROM weekly_slots WHERE active = 1").all() as Record<string, unknown>[]).map(parseWeeklySlotRow);
  const blockedRows = (db.prepare("SELECT local_date FROM blocked_dates").all() as Record<string, unknown>[]).map(parseBlockedDateRow);
  const blockedSet = new Set(blockedRows.map(r => r.local_date));

  const bookingsRows = (db.prepare("SELECT slot_key FROM bookings WHERE status IN ('pending', 'confirmed')").all() as Record<string, unknown>[]).map(parseBookingRow);
  const takenSlots = new Set(bookingsRows.map(r => r.slot_key));

  const minStart = new Date(nowMs + settings.minimum_notice_hours * 60 * 60 * 1000);
  const maxEnd = new Date(nowMs + settings.booking_window_weeks * 7 * 24 * 60 * 60 * 1000);

  const availableSlots: { date: string, time: string, slot_key: string }[] = [];

  const minLocalDate = getLocalDate(minStart, settings.timezone);
  const maxLocalDate = getLocalDate(maxEnd, settings.timezone);

  const currentCivilDate = dateStrToDate(minLocalDate.dateStr);
  const endCivilDate = dateStrToDate(maxLocalDate.dateStr);

  while (currentCivilDate <= endCivilDate) {
    const dateStr = formatDateStr(currentCivilDate);

    if (!blockedSet.has(dateStr)) {
      // Find weekday for this date string by resolving to midday UTC to avoid timezone shifts
      const midDayUtc = new Date(Date.UTC(currentCivilDate.getFullYear(), currentCivilDate.getMonth(), currentCivilDate.getDate(), 12, 0, 0));
      const local = getLocalDate(midDayUtc, settings.timezone);

      const daySlots = weeklyRows.filter(r => r.weekday === local.weekday);

      for (const slot of daySlots) {
        const slotKey = `${dateStr}T${slot.local_time}`;
        if (!takenSlots.has(slotKey)) {
          try {
            const slotUtc = getUtcDate(dateStr, slot.local_time, settings.timezone);
            if (slotUtc >= minStart && slotUtc <= maxEnd) {
              availableSlots.push({
                date: dateStr,
                time: slot.local_time,
                slot_key: slotKey
              });
            }
          } catch {
            // Unmappable time (e.g. falls inside DST forward gap). Skip it.
          }
        }
      }
    }

    currentCivilDate.setDate(currentCivilDate.getDate() + 1);
  }

  return availableSlots;
}

export function createPendingBooking(data: {
  date: string;
  time: string;
  names: string;
  email: string;
  phone?: string;
  wedding_date?: string;
  formula?: string;
  message?: string;
  language: 'fr' | 'en';
}, db: DatabaseSync = getBookingDb(), nowMs: number = Date.now()) {
  const settings = getSettings(db);
  const slotKey = `${data.date}T${data.time}`;

  const startsAtUtc = getUtcDate(data.date, data.time, settings.timezone);
  const endsAtUtc = new Date(startsAtUtc.getTime() + settings.duration_minutes * 60000);

  const id = crypto.randomUUID();

  db.exec("BEGIN IMMEDIATE TRANSACTION;");
  try {
    const isBlocked = db.prepare("SELECT 1 FROM blocked_dates WHERE local_date = ?").get(data.date);
    if (isBlocked) throw new Error("Date is blocked");

    const local = getLocalDate(startsAtUtc, settings.timezone);
    const hasSlot = db.prepare("SELECT 1 FROM weekly_slots WHERE weekday = ? AND local_time = ? AND active = 1").get(local.weekday, data.time);
    if (!hasSlot) throw new Error("Slot is not available");

    const minStart = new Date(nowMs + settings.minimum_notice_hours * 3600000);
    const maxEnd = new Date(nowMs + settings.booking_window_weeks * 604800000);
    if (startsAtUtc < minStart || startsAtUtc > maxEnd) {
      throw new Error("Slot is outside allowed booking window");
    }

    const insert = db.prepare(`
      INSERT INTO bookings (
        id, local_date, local_time, slot_key, starts_at_utc, ends_at_utc, timezone, status,
        names, email, phone, wedding_date, formula, message, language, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      id, data.date, data.time, slotKey, startsAtUtc.toISOString(), endsAtUtc.toISOString(), settings.timezone,
      data.names, data.email, data.phone || null, data.wedding_date || null, data.formula || null, data.message || null, data.language,
      nowMs, nowMs
    );

    db.exec("COMMIT;");
    return { id, slotKey, startsAtUtc };
  } catch (err: unknown) {
    db.exec("ROLLBACK;");
    if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
      throw new Error("ALREADY_BOOKED", { cause: err });
    }
    throw err;
  }
}

export function isValidVisioUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;

    const h = parsed.hostname;
    if (h === "meet.google.com" || h === "teams.microsoft.com" || h === "teams.live.com" || h === "zoom.us" || h.endsWith(".zoom.us")) return true;

    return false;
  } catch {
    return false;
  }
}

export function getAllBookings(db: DatabaseSync = getBookingDb(), _nowMs: number = Date.now()) {
  return (db.prepare("SELECT * FROM bookings ORDER BY created_at DESC").all() as Record<string, unknown>[]).map(parseBookingRow);
}

export function getBooking(id: string, db: DatabaseSync = getBookingDb()) {
  const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? parseBookingRow(row) : undefined;
}

export function updateBookingStatus(
  id: string,
  status: 'confirmed' | 'rejected' | 'cancelled',
  meetingUrl?: string,
  adminNote?: string,
  db: DatabaseSync = getBookingDb()
) {
  const now = Date.now();

  db.exec("BEGIN IMMEDIATE TRANSACTION;");
  try {
    const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new Error("Booking not found");
    const booking = parseBookingRow(row);

    if (booking.status === 'cancelled' || booking.status === 'rejected') {
      throw new Error("Cannot modify a rejected or cancelled booking");
    }
    if (booking.status === 'confirmed' && status === 'rejected') {
      throw new Error("Cannot reject a confirmed booking. Cancel it instead.");
    }
    if (status === 'confirmed' && booking.status === 'confirmed') {
      throw new Error("Booking is already confirmed");
    }

    if (status === 'confirmed') {
      if (!meetingUrl || !isValidVisioUrl(meetingUrl)) {
        throw new Error("A valid meeting URL is required to confirm a booking");
      }
      db.prepare(`
        UPDATE bookings
        SET status = 'confirmed', meeting_url = ?, admin_note = ?, updated_at = ?
        WHERE id = ?
      `).run(meetingUrl, adminNote || null, now, id);
    } else {
      db.prepare(`
        UPDATE bookings
        SET status = ?, admin_note = ?, updated_at = ?
        WHERE id = ?
      `).run(status, adminNote || null, now, id);
    }

    db.exec("COMMIT;");
    const updated = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as Record<string, unknown>;
    return parseBookingRow(updated);
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function getWeeklySlots(db: DatabaseSync = getBookingDb()) {
  return (db.prepare("SELECT * FROM weekly_slots ORDER BY weekday ASC, local_time ASC").all() as Record<string, unknown>[]).map(parseWeeklySlotRow);
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function checkSlotOverlap(weekday: number, localTime: string, excludeId: string | null = null, db: DatabaseSync = getBookingDb()): boolean {
  const settings = getSettings(db);
  const windowMinutes = settings.duration_minutes + settings.buffer_minutes;
  const newMins = timeToMinutes(localTime);

  const rows = (excludeId
    ? db.prepare("SELECT * FROM weekly_slots WHERE weekday = ? AND id != ?").all(weekday, excludeId)
    : db.prepare("SELECT * FROM weekly_slots WHERE weekday = ?").all(weekday)
  ) as Record<string, unknown>[];
  const mapped = rows.map(parseWeeklySlotRow);

  for (const slot of mapped) {
    const existingMins = timeToMinutes(slot.local_time);
    if (Math.abs(existingMins - newMins) < windowMinutes) {
      return true;
    }
  }
  return false;
}

export function createWeeklySlot(weekday: number, localTime: string, db: DatabaseSync = getBookingDb()) {
  if (weekday < 1 || weekday > 7) throw new Error("Invalid weekday");
  if (!/^\d{2}:\d{2}$/.test(localTime)) throw new Error("Invalid time format");

  if (checkSlotOverlap(weekday, localTime, null, db)) {
    throw new Error("OVERLAP: Le créneau se superpose avec un créneau existant (durée + buffer).");
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  try {
    db.prepare("INSERT INTO weekly_slots (id, weekday, local_time, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").run(
      id, weekday, localTime, now, now
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
      throw new Error("DUPLICATE: Ce créneau existe déjà.", { cause: err });
    }
    throw err;
  }
}

export function updateWeeklySlot(id: string, weekday: number, localTime: string, db: DatabaseSync = getBookingDb()) {
  if (weekday < 1 || weekday > 7) throw new Error("Invalid weekday");
  if (!/^\d{2}:\d{2}$/.test(localTime)) throw new Error("Invalid time format");

  if (checkSlotOverlap(weekday, localTime, id, db)) {
    throw new Error("OVERLAP: Le créneau se superpose avec un créneau existant (durée + buffer).");
  }

  const now = Date.now();
  try {
    db.prepare("UPDATE weekly_slots SET weekday = ?, local_time = ?, updated_at = ? WHERE id = ?").run(
      weekday, localTime, now, id
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
      throw new Error("DUPLICATE: Ce créneau existe déjà.", { cause: err });
    }
    throw err;
  }
}

export function deleteWeeklySlot(id: string, db: DatabaseSync = getBookingDb()) {
  db.prepare("DELETE FROM weekly_slots WHERE id = ?").run(id);
}

export function toggleWeeklySlot(id: string, db: DatabaseSync = getBookingDb()) {
  const now = Date.now();
  db.prepare("UPDATE weekly_slots SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?").run(now, id);
}

export function getBlockedDates(db: DatabaseSync = getBookingDb()) {
  return (db.prepare("SELECT * FROM blocked_dates ORDER BY local_date ASC").all() as Record<string, unknown>[]).map(parseBlockedDateRow);
}

export function addBlockedDate(local_date: string, reason?: string, db: DatabaseSync = getBookingDb()) {
  const now = Date.now();
  db.prepare("INSERT OR IGNORE INTO blocked_dates (id, local_date, reason, created_at) VALUES (?, ?, ?, ?)").run(
    crypto.randomUUID(), local_date, reason || null, now
  );
}

export function removeBlockedDate(id: string, db: DatabaseSync = getBookingDb()) {
  db.prepare("DELETE FROM blocked_dates WHERE id = ?").run(id);
}
