import crypto from "node:crypto";
import { initBookingDb } from "./db-booking.server";

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

function getSettings(): BookingSettings {
  const db = initBookingDb();
  const row = db.prepare("SELECT * FROM booking_settings WHERE id = 1").get() as unknown as BookingSettings;
  return {
    timezone: row.timezone,
    duration_minutes: row.duration_minutes,
    buffer_minutes: row.buffer_minutes,
    minimum_notice_hours: row.minimum_notice_hours,
    booking_window_weeks: row.booking_window_weeks
  };
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
  // en-GB weekday format: "Mon", "Tue", etc.
  const wMap: Record<string, number> = { "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6, "Sun": 7 };
  const weekday = wMap[p.weekday] || 1;
  
  return { dateStr, timeStr, weekday };
}

// Resolve Brussels local time back to UTC Date
export function getUtcDate(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  
  // Brute force from UTC-1 to UTC+3
  for (let offset = -1; offset <= 3; offset++) {
    const d = new Date(Date.UTC(year, month - 1, day, hour - offset, minute, 0));
    const check = getLocalDate(d, timeZone);
    if (check.dateStr === dateStr && check.timeStr === timeStr) {
      return d;
    }
  }
  throw new Error(`Invalid local date/time: ${dateStr} ${timeStr} in ${timeZone}`);
}

export function getAvailableSlots() {
  const db = initBookingDb();
  const settings = getSettings();
  
  const weeklyRows = db.prepare("SELECT * FROM weekly_slots WHERE active = 1").all() as unknown as WeeklySlot[];
  const blockedRows = db.prepare("SELECT local_date FROM blocked_dates").all() as unknown as BlockedDate[];
  const blockedSet = new Set(blockedRows.map(r => r.local_date));
  
  const bookingsRows = db.prepare("SELECT slot_key FROM bookings WHERE status IN ('pending', 'confirmed')").all() as unknown as Booking[];
  const takenSlots = new Set(bookingsRows.map(r => r.slot_key));

  const now = new Date();
  
  const minStart = new Date(now.getTime() + settings.minimum_notice_hours * 60 * 60 * 1000);
  const maxEnd = new Date(now.getTime() + settings.booking_window_weeks * 7 * 24 * 60 * 60 * 1000);
  
  const availableSlots: { date: string, time: string, slot_key: string }[] = [];
  
  // We can just iterate day by day in Brussels timezone from minStart to maxEnd
  // Since we don't have a specific date iterator, we iterate roughly by 24h steps but using local time
  const current = new Date(minStart);
  
  // Align current to start of day in UTC roughly
  current.setUTCHours(0,0,0,0);
  
  while (current <= maxEnd) {
    const local = getLocalDate(current, settings.timezone);
    
    if (!blockedSet.has(local.dateStr)) {
      // Find weekly slots matching this weekday
      const daySlots = weeklyRows.filter(r => r.weekday === local.weekday);
      
      for (const slot of daySlots) {
        const slotKey = `${local.dateStr}T${slot.local_time}`;
        if (!takenSlots.has(slotKey)) {
          // Check if this slot actually falls between minStart and maxEnd in absolute UTC
          try {
            const slotUtc = getUtcDate(local.dateStr, slot.local_time, settings.timezone);
            if (slotUtc >= minStart && slotUtc <= maxEnd) {
              availableSlots.push({
                date: local.dateStr,
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
    
    // Advance by exactly 24 UTC hours
    current.setUTCDate(current.getUTCDate() + 1);
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
}) {
  const db = initBookingDb();
  const settings = getSettings();
  const slotKey = `${data.date}T${data.time}`;
  
  // Calculate UTC start/end
  const startsAtUtc = getUtcDate(data.date, data.time, settings.timezone);
  const endsAtUtc = new Date(startsAtUtc.getTime() + settings.duration_minutes * 60000);
  
  const id = crypto.randomUUID();
  const now = Date.now();

  db.exec("BEGIN IMMEDIATE TRANSACTION;");
  try {
    // 1. Re-validate slot is not blocked
    const isBlocked = db.prepare("SELECT 1 FROM blocked_dates WHERE local_date = ?").get(data.date);
    if (isBlocked) throw new Error("Date is blocked");
    
    // 2. Re-validate weekly slot exists and is active
    const local = getLocalDate(startsAtUtc, settings.timezone);
    const hasSlot = db.prepare("SELECT 1 FROM weekly_slots WHERE weekday = ? AND local_time = ? AND active = 1").get(local.weekday, data.time);
    if (!hasSlot) throw new Error("Slot is not available");

    // 3. Re-validate limits (48h / 8 weeks)
    const minStart = new Date(now + settings.minimum_notice_hours * 3600000);
    const maxEnd = new Date(now + settings.booking_window_weeks * 604800000);
    if (startsAtUtc < minStart || startsAtUtc > maxEnd) {
      throw new Error("Slot is outside allowed booking window");
    }

    // 4. Insert booking (fails if partial unique index triggers)
    const insert = db.prepare(`
      INSERT INTO bookings (
        id, local_date, local_time, slot_key, starts_at_utc, ends_at_utc, timezone, status,
        names, email, phone, wedding_date, formula, message, language, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    insert.run(
      id, data.date, data.time, slotKey, startsAtUtc.toISOString(), endsAtUtc.toISOString(), settings.timezone,
      data.names, data.email, data.phone || null, data.wedding_date || null, data.formula || null, data.message || null, data.language,
      now, now
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
    if (h === "meet.google.com") return true;
    if (h === "teams.microsoft.com") return true;
    if (h === "teams.live.com") return true;
    if (h === "zoom.us" || h.endsWith(".zoom.us")) return true;
    
    return false;
  } catch {
    return false;
  }
}

export function getAllBookings() {
  const db = initBookingDb();
  return db.prepare("SELECT * FROM bookings ORDER BY created_at DESC").all() as unknown as Booking[];
}

export function getBooking(id: string) {
  const db = initBookingDb();
  return db.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as unknown as Booking | undefined;
}

export function updateBookingStatus(
  id: string, 
  status: 'confirmed' | 'rejected' | 'cancelled', 
  meetingUrl?: string, 
  adminNote?: string
) {
  const db = initBookingDb();
  const now = Date.now();
  
  db.exec("BEGIN IMMEDIATE TRANSACTION;");
  try {
    const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as unknown as Booking | undefined;
    if (!booking) throw new Error("Booking not found");
    
    // Status state machine
    if (booking.status === 'cancelled' || booking.status === 'rejected') {
      throw new Error("Cannot modify a rejected or cancelled booking");
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
    return db.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as unknown as Booking;
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function getWeeklySlots() {
  const db = initBookingDb();
  return db.prepare("SELECT * FROM weekly_slots ORDER BY weekday ASC, local_time ASC").all() as unknown as WeeklySlot[];
}

export function toggleWeeklySlot(id: string) {
  const db = initBookingDb();
  const now = Date.now();
  const stmt = db.prepare("UPDATE weekly_slots SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?");
  stmt.run(now, id);
}

export function getBlockedDates() {
  const db = initBookingDb();
  return db.prepare("SELECT * FROM blocked_dates ORDER BY local_date ASC").all() as unknown as BlockedDate[];
}

export function addBlockedDate(local_date: string, reason?: string) {
  const db = initBookingDb();
  const now = Date.now();
  db.prepare("INSERT OR IGNORE INTO blocked_dates (id, local_date, reason, created_at) VALUES (?, ?, ?, ?)").run(
    crypto.randomUUID(), local_date, reason || null, now
  );
}

export function removeBlockedDate(id: string) {
  const db = initBookingDb();
  db.prepare("DELETE FROM blocked_dates WHERE id = ?").run(id);
}
