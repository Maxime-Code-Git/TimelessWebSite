import { DatabaseSync } from "node:sqlite";

export interface SqliteRetryOptions {
  maxRetries?: number;
  busyTimeoutMs?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Checks if an error is due to SQLite lock contention (SQLITE_BUSY or SQLITE_LOCKED).
 */
export function isSqliteLockedOrBusyError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { errcode?: number; message?: string; errstr?: string; code?: string };
  if (e.errcode === 5 || e.errcode === 6) return true; // 5: SQLITE_BUSY, 6: SQLITE_LOCKED
  const msg = String(e.message || e.errstr || "").toLowerCase();
  return (
    msg.includes("database is locked") ||
    msg.includes("database is busy") ||
    msg.includes("table is locked") ||
    msg.includes("sqlite_busy") ||
    msg.includes("sqlite_locked")
  );
}

/**
 * Executes an operation with an isolated SQLite connection.
 * - Sets PRAGMA busy_timeout and foreign_keys
 * - Guarantees connection close in a finally block
 * - Retries in a bounded manner ONLY if SQLITE_BUSY or SQLITE_LOCKED is encountered
 * - Closes and reopens a clean connection per retry attempt
 * - Never masks definitive or non-busy errors
 */
export async function executeWithSqliteRetry<T>(
  dbPath: string,
  operation: (db: DatabaseSync) => T | Promise<T>,
  options: SqliteRetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 5;
  const busyTimeoutMs = options.busyTimeoutMs ?? 5000;
  const initialDelayMs = options.initialDelayMs ?? 50;
  const maxDelayMs = options.maxDelayMs ?? 500;

  let attempt = 0;
  let delay = initialDelayMs;

  while (true) {
    attempt++;
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(dbPath);
      db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs};`);
      db.exec("PRAGMA foreign_keys = ON;");

      const result = await operation(db);
      return result;
    } catch (err: unknown) {
      if (isSqliteLockedOrBusyError(err) && attempt <= maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, maxDelayMs);
        continue;
      }
      throw err;
    } finally {
      if (db) {
        try {
          db.close();
        } catch {
          // Ignore close errors during failure
        }
      }
    }
  }
}
