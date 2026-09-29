import * as fs from "node:fs";
import * as path from "node:path";
import { getGalleryDb } from "./gallery-db.server";
import * as crypto from "node:crypto";

const BATCH_SIZE = 5;
const LEASE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

export function processGalleryDeletions() {
  const db = getGalleryDb();
  const workerId = crypto.randomUUID();
  const now = Date.now();

  try {
    db.exec("BEGIN EXCLUSIVE TRANSACTION;");
    
    // Select jobs
    const pendingJobs = db.prepare(`
      SELECT id, relative_quarantine_path 
      FROM gallery_deletion_jobs 
      WHERE (status = 'pending' OR (status = 'processing' AND lease_expires_at < ?))
        AND attempt_count < ?
      LIMIT ?
    `).all(now, MAX_ATTEMPTS, BATCH_SIZE) as { id: string, relative_quarantine_path: string }[];

    if (pendingJobs.length === 0) {
      db.exec("COMMIT;");
      return;
    }

    const leaseExpiresAt = now + LEASE_DURATION;
    const updateJob = db.prepare(`
      UPDATE gallery_deletion_jobs 
      SET status = 'processing', worker_id = ?, lease_expires_at = ?, updated_at = ?, attempt_count = attempt_count + 1 
      WHERE id = ?
    `);

    for (const job of pendingJobs) {
      updateJob.run(workerId, leaseExpiresAt, now, job.id);
    }
    
    db.exec("COMMIT;");

    const markCompleted = db.prepare(`
      UPDATE gallery_deletion_jobs 
      SET status = 'completed', updated_at = ?, error_message = NULL 
      WHERE id = ?
    `);

    const markFailed = db.prepare(`
      UPDATE gallery_deletion_jobs 
      SET status = 'failed', updated_at = ?, error_message = ? 
      WHERE id = ?
    `);
    
    const markPending = db.prepare(`
      UPDATE gallery_deletion_jobs 
      SET status = 'pending', updated_at = ?, error_message = ? 
      WHERE id = ?
    `);

    const baseTrash = path.resolve(process.cwd(), "data", ".trash", "gallery-deletions");

    for (const job of pendingJobs) {
      try {
        const quarantineDir = path.resolve(process.cwd(), job.relative_quarantine_path);
        
        // Ensure path resolves inside the baseTrash
        const relativeToTrash = path.relative(baseTrash, quarantineDir);
        if (relativeToTrash.includes("..") || relativeToTrash === "" || !quarantineDir.startsWith(baseTrash)) {
          throw new Error("Invalid quarantine path");
        }
        
        if (fs.existsSync(quarantineDir)) {
          fs.rmSync(quarantineDir, { recursive: true, force: true });
        }
        
        markCompleted.run(Date.now(), job.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        // If we still have attempts left, mark as pending for next run, else failed
        const jobRow = db.prepare("SELECT attempt_count FROM gallery_deletion_jobs WHERE id = ?").get(job.id) as { attempt_count: number };
        if (jobRow && jobRow.attempt_count < MAX_ATTEMPTS) {
          markPending.run(Date.now(), msg, job.id);
        } else {
          markFailed.run(Date.now(), msg, job.id);
        }
      }
    }
  } catch (err) {
    try { db.exec("ROLLBACK;"); } catch (e) { console.error(e) }
    console.error("Error in processGalleryDeletions:", err);
  }
}

let workerStarted = false;

export function resumeGalleryDeletions(): void {
  if (workerStarted) return;
  workerStarted = true;
  if (!process.env.__TEST_DISABLE_WORKER) {
    // Only run once on startup
    setImmediate(() => {
      processGalleryDeletions();
    });
  }
}
