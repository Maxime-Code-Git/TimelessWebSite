import { describe, it, expect, beforeAll, afterEach } from "vitest";
import * as fs from "node:fs";
import sharp from "sharp";
import * as path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getGalleryDb } from "~/lib/gallery-db.server";
import { ENV } from "~/lib/env.server";
import { startGalleryImport, processImport, WORKER_ID } from "~/lib/gallery-import.server";

const WORKER_LEASE_MS = 30000;

describe("Gallery Import Worker Logic", () => {
  let db: DatabaseSync;
  const galleryId = "test-gallery";
  let importDir = "";

  beforeAll(async () => {
    importDir = path.join(ENV.GALLERY_IMPORT_PATH, "worker-test");
    fs.mkdirSync(path.join(importDir, "invites/photos"), { recursive: true });

    const dummyJpegPath1 = path.join(importDir, "invites/photos/test1.jpg");
    const dummyJpegPath2 = path.join(importDir, "invites/photos/test2.jpg");
    await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } } }).jpeg().toFile(dummyJpegPath1);
    await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } } }).jpeg().toFile(dummyJpegPath2);

    db = getGalleryDb();

    // Ensure gallery exists
    try {
      db.prepare(`INSERT INTO galleries (id, public_id, bride_names, wedding_date, created_at, expires_at, status, guest_code_hash, couple_code_hash, guest_code_encrypted, couple_code_encrypted)
      VALUES (?, 'pub', 'A&B', '2026-01-01', ?, ?, 'draft', 'x', 'y', 'z', 'w')`).run(galleryId, Date.now(), Date.now() + 86400000);
    } catch { /* ignore */ }
  });

  afterEach(() => {
    db.prepare("DELETE FROM gallery_imports").run();
    db.prepare("DELETE FROM gallery_media").run();
    const mediaDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId);
    if (fs.existsSync(mediaDir)) {
      fs.rmSync(mediaDir, { recursive: true, force: true });
    }
  });

  it("should prevent 2 workers from acquiring the same job concurrently", () => {
    startGalleryImport(galleryId, "worker-test");
    const res1 = db.prepare(`
      UPDATE gallery_imports
      SET status = 'processing', worker_id = 'w1', lease_expires_at = ?, attempt_count = 1
      WHERE id = (
        SELECT id FROM gallery_imports WHERE status = 'pending' LIMIT 1
      ) RETURNING id
    `).get(Date.now() + WORKER_LEASE_MS);
    expect(res1).toBeDefined();

    const res2 = db.prepare(`
      UPDATE gallery_imports
      SET status = 'processing', worker_id = 'w2', lease_expires_at = ?, attempt_count = 1
      WHERE id = (
        SELECT id FROM gallery_imports WHERE status = 'pending' LIMIT 1
      ) RETURNING id
    `).get(Date.now() + WORKER_LEASE_MS);
    expect(res2).toBeUndefined(); // Job already claimed
  });

  it("should allow stealing an expired lease", () => {
    const importId = startGalleryImport(galleryId, "worker-test");
    db.prepare(`UPDATE gallery_imports SET status = 'processing', worker_id = 'w1', lease_expires_at = ? WHERE id = ?`).run(Date.now() - 1000, importId);

    const res = db.prepare(`
      UPDATE gallery_imports
      SET status = 'processing', worker_id = 'w2', lease_expires_at = ?, attempt_count = 2
      WHERE id = (
        SELECT id FROM gallery_imports WHERE (status = 'pending') OR (status = 'processing' AND lease_expires_at < ?) LIMIT 1
      ) RETURNING id
    `).get(Date.now() + WORKER_LEASE_MS, Date.now());

    expect(res).toBeDefined();

    const job = db.prepare("SELECT worker_id, attempt_count FROM gallery_imports WHERE id = ?").get(importId) as Record<string, unknown>;
    expect(job.worker_id).toBe("w2");
    expect(job.attempt_count).toBe(2);
  });

  it("should stop processing if lease is lost (heartbeat cancel)", async () => {
    const importId = startGalleryImport(galleryId, "worker-test");
    db.prepare("UPDATE gallery_imports SET status = 'processing', worker_id = ?, lease_expires_at = ? WHERE id = ?").run(WORKER_ID, Date.now() + 30000, importId);
    const promise = processImport(importId, galleryId, "worker-test");

    db.prepare("UPDATE gallery_imports SET lease_expires_at = ?, worker_id = 'thief' WHERE id = ?").run(Date.now() + 10000, importId);

    await promise;

    const job = db.prepare("SELECT status FROM gallery_imports WHERE id = ?").get(importId) as Record<string, unknown>;
    expect(job.status).toBe("processing");
  });

  it("should recover crashed .tmp files (crash after copy)", async () => {
    const mediaDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId);
    fs.mkdirSync(mediaDir, { recursive: true });

    const fakeId = crypto.randomUUID();
    fs.writeFileSync(path.join(mediaDir, fakeId + ".tmp"), "some data");

    db.prepare(`INSERT INTO gallery_media (id, gallery_id, type, visibility, original_name, mime_type, size, hash, created_at)
                VALUES (?, ?, 'photo', 'invites', 'test1.jpg', 'image/jpeg', 9, 'hash', ?)`)
      .run(fakeId, galleryId, Date.now());

    const importId = startGalleryImport(galleryId, "worker-test");
    db.prepare("UPDATE gallery_imports SET status = 'processing', worker_id = ?, lease_expires_at = ? WHERE id = ?").run(WORKER_ID, Date.now() + 30000, importId);
    await processImport(importId, galleryId, "worker-test");

    expect(fs.existsSync(path.join(mediaDir, fakeId + ".tmp"))).toBe(false);
    expect(fs.existsSync(path.join(mediaDir, fakeId))).toBe(true);
  });

  it("should clean up orphan files not in DB", async () => {
    const mediaDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId);
    fs.mkdirSync(mediaDir, { recursive: true });

    const fakeId = crypto.randomUUID();
    fs.writeFileSync(path.join(mediaDir, fakeId), "orphan data");

    const importId = startGalleryImport(galleryId, "worker-test");
    db.prepare("UPDATE gallery_imports SET status = 'processing', worker_id = ?, lease_expires_at = ? WHERE id = ?").run(WORKER_ID, Date.now() + 30000, importId);
    await processImport(importId, galleryId, "worker-test");

    expect(fs.existsSync(path.join(mediaDir, fakeId))).toBe(false);
  });

  it("should clean up phantom DB records missing files", async () => {
    const fakeId = crypto.randomUUID();
    db.prepare(`INSERT INTO gallery_media (id, gallery_id, type, visibility, original_name, mime_type, size, hash, created_at)
                VALUES (?, ?, 'photo', 'invites', 'test1.jpg', 'image/jpeg', 9, 'hash', ?)`)
      .run(fakeId, galleryId, Date.now());

    const importId = startGalleryImport(galleryId, "worker-test");
    db.prepare("UPDATE gallery_imports SET status = 'processing', worker_id = ?, lease_expires_at = ? WHERE id = ?").run(WORKER_ID, Date.now() + 30000, importId);
    await processImport(importId, galleryId, "worker-test");

    const rec = db.prepare("SELECT * FROM gallery_media WHERE id = ?").get(fakeId);
    expect(rec).toBeUndefined();
  });

  it("should avoid duplicates when resuming", async () => {
    const importId = startGalleryImport(galleryId, "worker-test");
    db.prepare("UPDATE gallery_imports SET status = 'processing', worker_id = ?, lease_expires_at = ? WHERE id = ?").run(WORKER_ID, Date.now() + 30000, importId);
    await processImport(importId, galleryId, "worker-test");

    const medias = db.prepare("SELECT * FROM gallery_media WHERE gallery_id = ?").all(galleryId) as Record<string, unknown>[];
    expect(medias.length).toBe(1);

    const job = db.prepare("SELECT result_json FROM gallery_imports WHERE id = ?").get(importId) as Record<string, unknown>;
    const res = JSON.parse(job.result_json as string);
    expect(res.ignored.length).toBe(1);
    expect(res.ignored[0].reason).toContain("Doublon");
  });
});
