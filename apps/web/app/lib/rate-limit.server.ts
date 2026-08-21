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
export function checkRateLimit(ip: string) {
  initDb();
  
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  
  // Hash the IP to avoid storing PII
  const hash = crypto
    .createHmac("sha256", ENV.CONTACT_RATE_LIMIT_SECRET)
    .update(ip)
    .digest("hex");

  // Use a transaction for atomic check and insert
  db.exec("BEGIN EXCLUSIVE TRANSACTION");
  try {
    // 1. Cleanup old records
    const cleanupStmt = db.prepare("DELETE FROM requests WHERE timestamp < ?");
    cleanupStmt.run(oneHourAgo);
    
    // 2. Count recent requests
    const countStmt = db.prepare("SELECT COUNT(*) as count FROM requests WHERE hash = ? AND timestamp >= ?");
    const result = countStmt.get(hash, oneHourAgo) as { count: number };
    
    const maxAttempts = parseInt(process.env.CONTACT_RATE_LIMIT_MAX || "5", 10);
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
