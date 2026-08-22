import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ENV } from "./env.server";

let db: DatabaseSync;

function initDb() {
  if (db) return;
  const dbPath = ENV.RATE_LIMIT_DB_PATH;

  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      hash TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_requests_hash ON requests(hash);
    CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
  `);
}

/**
 * Checks rate limit for the given IP address.
 * Throws an Error if rate limit is exceeded.
 */
export function checkRateLimit(ip: string, namespace: string = "contact") {
  initDb();

  const now = Date.now();
  // Different namespaces have different windows and limits
  let windowMs = 60 * 60 * 1000; // 1 hour for contact
  let maxAttempts = ENV.CONTACT_RATE_LIMIT_MAX;

  if (namespace === "admin") {
    windowMs = 15 * 60 * 1000; // 15 minutes for admin
    maxAttempts = 5;
  }

  const windowStart = now - windowMs;

  // Hash the IP with the namespace to avoid storing PII and to separate limits
  const hash = crypto
    .createHmac("sha256", ENV.CONTACT_RATE_LIMIT_SECRET)
    .update(`${namespace}:${ip}`)
    .digest("hex");

  // Use a transaction for atomic check and insert
  db.exec("BEGIN EXCLUSIVE TRANSACTION");
  try {
    // 1. Cleanup old records (global cleanup for all old records older than 1 hour)
    const cleanupStmt = db.prepare("DELETE FROM requests WHERE timestamp < ?");
    cleanupStmt.run(now - 60 * 60 * 1000);

    // 2. Count recent requests for this specific hash
    const countStmt = db.prepare("SELECT COUNT(*) as count FROM requests WHERE hash = ? AND timestamp >= ?");
    const result = countStmt.get(hash, windowStart) as { count: number };

    if (result.count >= maxAttempts) {
      throw new Error("Rate limit exceeded");
    }

    // 3. Insert new request
    const insertStmt = db.prepare("INSERT INTO requests (hash, timestamp) VALUES (?, ?)");
    insertStmt.run(hash, now);

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Resets the rate limit for the given IP address and namespace.
 * Useful upon successful authentication to clear failure counters.
 */
export function resetRateLimit(ip: string, namespace: string = "contact") {
  initDb();

  const hash = crypto
    .createHmac("sha256", ENV.CONTACT_RATE_LIMIT_SECRET)
    .update(`${namespace}:${ip}`)
    .digest("hex");

  const stmt = db.prepare("DELETE FROM requests WHERE hash = ?");
  stmt.run(hash);
}
