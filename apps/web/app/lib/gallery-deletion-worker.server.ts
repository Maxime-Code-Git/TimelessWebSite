import * as fs from "node:fs";
import * as path from "node:path";
import { getGalleryDb } from "./gallery-db.server";
import { ENV } from "./env.server";
import * as crypto from "node:crypto";

const BATCH_SIZE = 5;
const LEASE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

/**
 * Validates that `target` is strictly confined inside `base`.
 * Returns the validated relative path or throws.
 */
function validateConfinement(base: string, target: string): string {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  const rel = path.relative(resolvedBase, resolvedTarget);

  if (
    !rel ||
    path.isAbsolute(rel) ||
    rel.startsWith(".." + path.sep) ||
    rel === ".."
  ) {
    throw new Error("INVALID_QUARANTINE_PATH");
  }

  return rel;
}

/**
 * Sanitises an error for safe storage: no absolute paths, no stack traces.
 */
function safeErrorCode(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("EPERM") || msg.includes("EACCES")) return "CLEANUP_PERMISSION_DENIED";
    if (msg.includes("ENOENT")) return "CLEANUP_PATH_NOT_FOUND";
    if (msg.includes("INVALID_QUARANTINE_PATH")) return "INVALID_QUARANTINE_PATH";
    if (msg.includes("RESTORE_FAILED")) return "RESTORE_FAILED";
    return "CLEANUP_FAILED";
  }
  return "CLEANUP_FAILED";
}

export function processGalleryDeletions(): void {
  const db = getGalleryDb();
  const workerId = crypto.randomUUID();
  const now = Date.now();

  try {
    db.exec("BEGIN EXCLUSIVE TRANSACTION;");

    const pendingJobs = db.prepare(
      `SELECT id, relative_quarantine_path
       FROM gallery_deletion_jobs
       WHERE (status = 'pending' OR (status = 'processing' AND lease_expires_at < ?))
         AND attempt_count < ?
       LIMIT ?`
    ).all(now, MAX_ATTEMPTS, BATCH_SIZE) as {
      id: string;
      relative_quarantine_path: string;
    }[];

    if (pendingJobs.length === 0) {
      db.exec("COMMIT;");
      return;
    }

    const leaseExpiresAt = now + LEASE_DURATION;
    const updateJob = db.prepare(
      `UPDATE gallery_deletion_jobs
       SET status = 'processing',
           worker_id = ?,
           lease_expires_at = ?,
           updated_at = ?,
           attempt_count = attempt_count + 1
       WHERE id = ?`
    );

    for (const job of pendingJobs) {
      updateJob.run(workerId, leaseExpiresAt, now, job.id);
    }

    db.exec("COMMIT;");

    // Mark max-attempt jobs as failed
    const failMaxAttempts = db.prepare(
      `UPDATE gallery_deletion_jobs
       SET status = 'failed',
           updated_at = ?,
           error_message = 'MAX_ATTEMPTS_REACHED',
           worker_id = NULL,
           lease_expires_at = NULL
       WHERE id = ? AND attempt_count >= ?`
    );

    const markCompleted = db.prepare(
      `UPDATE gallery_deletion_jobs
       SET status = 'completed',
           updated_at = ?,
           error_message = NULL,
           worker_id = NULL,
           lease_expires_at = NULL
       WHERE id = ?`
    );

    const markPending = db.prepare(
      `UPDATE gallery_deletion_jobs
       SET status = 'pending',
           updated_at = ?,
           error_message = ?,
           worker_id = NULL,
           lease_expires_at = NULL
       WHERE id = ?`
    );

    const markFailed = db.prepare(
      `UPDATE gallery_deletion_jobs
       SET status = 'failed',
           updated_at = ?,
           error_message = ?,
           worker_id = NULL,
           lease_expires_at = NULL
       WHERE id = ?`
    );

    const baseMedia = path.resolve(ENV.GALLERY_MEDIA_PATH);
    const trashBase = path.join(baseMedia, ".trash", "gallery-deletions");

    for (const job of pendingJobs) {
      try {
        // Check if max attempts reached after increment
        const currentJob = db.prepare(
          "SELECT attempt_count FROM gallery_deletion_jobs WHERE id = ?"
        ).get(job.id) as { attempt_count: number } | undefined;

        if (currentJob && currentJob.attempt_count >= MAX_ATTEMPTS) {
          failMaxAttempts.run(Date.now(), job.id, MAX_ATTEMPTS);
          continue;
        }

        // Validate quarantine path is confined within trash
        const quarantineDir = path.resolve(baseMedia, job.relative_quarantine_path);
        validateConfinement(trashBase, quarantineDir);

        // Reject symlinks
        if (fs.existsSync(quarantineDir)) {
          const stat = fs.lstatSync(quarantineDir);
          if (stat.isSymbolicLink() || !stat.isDirectory()) {
            throw new Error("INVALID_QUARANTINE_PATH");
          }
          fs.rmSync(quarantineDir, { recursive: true, force: true });
        }

        markCompleted.run(Date.now(), job.id);
      } catch (err: unknown) {
        const code = safeErrorCode(err);
        const jobRow = db.prepare(
          "SELECT attempt_count FROM gallery_deletion_jobs WHERE id = ?"
        ).get(job.id) as { attempt_count: number } | undefined;

        if (jobRow && jobRow.attempt_count >= MAX_ATTEMPTS) {
          markFailed.run(Date.now(), code, job.id);
        } else {
          markPending.run(Date.now(), code, job.id);
        }
      }
    }
  } catch {
    try { db.exec("ROLLBACK;"); } catch { /* already rolled back */ }
  }
}

/**
 * Re-processes a single failed job by resetting it to pending.
 */
export function retryFailedJob(jobId: string): void {
  if (!jobId || typeof jobId !== "string" || !/^[0-9a-f-]+$/i.test(jobId)) {
    throw new Error("INVALID_JOB_ID");
  }

  const db = getGalleryDb();
  const job = db.prepare(
    "SELECT id, status FROM gallery_deletion_jobs WHERE id = ?"
  ).get(jobId) as { id: string; status: string } | undefined;

  if (!job) {
    throw new Error("JOB_NOT_FOUND");
  }
  if (job.status !== "failed") {
    throw new Error("JOB_NOT_FAILED");
  }

  db.prepare(
    `UPDATE gallery_deletion_jobs
     SET status = 'pending',
         attempt_count = 0,
         error_message = NULL,
         worker_id = NULL,
         lease_expires_at = NULL,
         updated_at = ?
     WHERE id = ?`
  ).run(Date.now(), jobId);
}

let workerStarted = false;

export function resumeGalleryDeletions(): void {
  if (workerStarted) return;
  workerStarted = true;
  if (!process.env.__TEST_DISABLE_WORKER) {
    setImmediate(() => {
      processGalleryDeletions();
    });
  }
}
