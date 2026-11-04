import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import crypto from "node:crypto";
import { getGalleryDb } from "~/lib/gallery-db.server";
import { ENV } from "~/lib/env.server";
import {
  startGalleryImport,
  isImportWorkerDisabled,
  getActiveImportInfo,
} from "~/lib/gallery-import.server";

describe("Gallery Import Worker Lifecycle & Auto-Launch", () => {
  let galleryId: string;
  let folderName: string;
  let importDir: string;
  let mediaDir: string;

  beforeEach(() => {
    delete process.env.__TEST_DISABLE_WORKER;
    delete process.env.DISABLE_IMPORT_WORKER;

    galleryId = "lifecycle-" + crypto.randomUUID();
    folderName = "folder-" + galleryId;

    const db = getGalleryDb();
    // Create gallery
    db.prepare(`
      INSERT INTO galleries (id, public_id, bride_names, wedding_date, created_at, expires_at, status, guest_code_hash, couple_code_hash, guest_code_encrypted, couple_code_encrypted, upload_folder)
      VALUES (?, ?, 'Alice & Bob', '2026-06-15', ?, ?, 'draft', 'h1', 'h2', 'enc1', 'enc2', ?)
    `).run(galleryId, "pub-" + galleryId, Date.now(), Date.now() + 86400000, folderName);

    importDir = path.join(ENV.GALLERY_IMPORT_PATH, folderName);
    mediaDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId);

    if (fs.existsSync(importDir)) fs.rmSync(importDir, { recursive: true, force: true });
    if (fs.existsSync(mediaDir)) fs.rmSync(mediaDir, { recursive: true, force: true });

    fs.mkdirSync(path.join(importDir, "invites/videos"), { recursive: true });
    fs.mkdirSync(path.join(importDir, "maries/videos"), { recursive: true });
    fs.mkdirSync(mediaDir, { recursive: true });
  });

  afterEach(() => {
    delete process.env.__TEST_DISABLE_WORKER;
    delete process.env.DISABLE_IMPORT_WORKER;
    const db = getGalleryDb();
    db.prepare("DELETE FROM gallery_imports WHERE gallery_id = ?").run(galleryId);
    db.prepare("DELETE FROM gallery_media WHERE gallery_id = ?").run(galleryId);
    db.prepare("DELETE FROM galleries WHERE id = ?").run(galleryId);
    if (fs.existsSync(importDir)) fs.rmSync(importDir, { recursive: true, force: true });
    if (fs.existsSync(mediaDir)) fs.rmSync(mediaDir, { recursive: true, force: true });
  });

  it("safely parses boolean flags in isImportWorkerDisabled", () => {
    process.env.__TEST_DISABLE_WORKER = "true";
    expect(isImportWorkerDisabled()).toBe(true);

    process.env.__TEST_DISABLE_WORKER = "1";
    expect(isImportWorkerDisabled()).toBe(true);

    process.env.__TEST_DISABLE_WORKER = "yes";
    expect(isImportWorkerDisabled()).toBe(true);

    // CRITICAL: string "false" must evaluate to false
    process.env.__TEST_DISABLE_WORKER = "false";
    expect(isImportWorkerDisabled()).toBe(false);

    process.env.__TEST_DISABLE_WORKER = "0";
    expect(isImportWorkerDisabled()).toBe(false);

    delete process.env.__TEST_DISABLE_WORKER;
    expect(isImportWorkerDisabled()).toBe(false);
  });

  it("remains pending if worker is disabled", async () => {
    process.env.__TEST_DISABLE_WORKER = "true";
    expect(isImportWorkerDisabled()).toBe(true);

    // Create a dummy video file
    const v1Path = path.join(importDir, "invites/videos/sample.mp4");
    const fakeMp4Header = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
    const fakeMp4Body = crypto.randomBytes(2048);
    fs.writeFileSync(v1Path, Buffer.concat([fakeMp4Header, fakeMp4Body]));

    const importId = startGalleryImport(galleryId, folderName);
    expect(importId).toBeDefined();

    // Give it a moment: job must remain pending because worker was NOT scheduled
    await new Promise(r => setTimeout(r, 200));

    const db = getGalleryDb();
    const job = db.prepare("SELECT status, worker_id FROM gallery_imports WHERE id = ?").get(importId) as { status: string; worker_id: string | null };
    expect(job.status).toBe("pending");
    expect(job.worker_id).toBeNull();
  });

  it("automatically launches worker, transitions through pending -> processing -> completed, imports 2 distinct videos and deduplicates 1 renamed duplicate with name reference", async () => {
    process.env.__TEST_DISABLE_WORKER = "false";
    expect(isImportWorkerDisabled()).toBe(false);

    // Create Video 1: in invites/videos
    const v1Header = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
    const v1Content = Buffer.concat([v1Header, Buffer.from("VIDEO_ONE_UNIQUE_CONTENT_A1B2C3D4E5F6")]);
    const v1Path = path.join(importDir, "invites/videos/teaser-ceremonie.mp4");
    fs.writeFileSync(v1Path, v1Content);

    // Create Video 2: in maries/videos (distinct content)
    const v2Content = Buffer.concat([v1Header, Buffer.from("VIDEO_TWO_DIFFERENT_CONTENT_G7H8I9J0K1L2")]);
    const v2Path = path.join(importDir, "maries/videos/film-integral.mp4");
    fs.writeFileSync(v2Path, v2Content);

    // Create Video 3: in invites/videos - exact duplicate of Video 1, but renamed
    const v3Path = path.join(importDir, "invites/videos/teaser-copie-renommee.mp4");
    fs.writeFileSync(v3Path, v1Content);

    // Launch import: worker should automatically start without calling processImport directly!
    const importId = startGalleryImport(galleryId, folderName);
    expect(importId).toBeDefined();

    const db = getGalleryDb();

    // Poll until completed (lifecycle pending -> processing -> completed)
    const start = Date.now();
    let finalJob: { status: string; progress: number; total: number; result_json: string } | undefined;

    while (Date.now() - start < 15000) {
      await new Promise(r => setTimeout(r, 200));
      const row = db.prepare(
        "SELECT status, progress, total, result_json FROM gallery_imports WHERE id = ?"
      ).get(importId) as { status: string; progress: number; total: number; result_json: string } | undefined;

      if (row?.status === "completed" || row?.status === "failed") {
        finalJob = row;
        break;
      }
    }

    expect(finalJob).toBeDefined();
    expect(finalJob?.status).toBe("completed");

    const result = JSON.parse(finalJob!.result_json);
    expect(result.imported).toBe(2); // 2 distinct videos imported
    expect(result.duplicates.length).toBe(1); // 1 duplicate

    // Check duplicate breakdown mentions the matching file name
    const dup = result.duplicates[0];
    expect(dup.file).toBe("teaser-copie-renommee.mp4");
    expect(dup.reason).toContain("teaser-ceremonie.mp4");

    // Check gallery_media records
    const media = db.prepare(
      "SELECT id, type, visibility, original_name, size, hash FROM gallery_media WHERE gallery_id = ? ORDER BY original_name ASC"
    ).all(galleryId) as Array<{
      id: string;
      type: string;
      visibility: string;
      original_name: string;
      size: number;
      hash: string;
    }>;

    expect(media.length).toBe(2);

    const v1Media = media.find(m => m.original_name === "teaser-ceremonie.mp4");
    expect(v1Media).toBeDefined();
    expect(v1Media?.visibility).toBe("invites");
    expect(v1Media?.type).toBe("video");
    expect(fs.existsSync(path.join(mediaDir, v1Media!.id))).toBe(true);

    const v2Media = media.find(m => m.original_name === "film-integral.mp4");
    expect(v2Media).toBeDefined();
    expect(v2Media?.visibility).toBe("maries");
    expect(v2Media?.type).toBe("video");
    expect(fs.existsSync(path.join(mediaDir, v2Media!.id))).toBe(true);

    // Active tracking should be cleared when completed
    expect(getActiveImportInfo(galleryId)).toBeNull();
  });
});
