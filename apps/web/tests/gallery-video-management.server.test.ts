// @vitest-environment node
import type { ActionFunctionArgs } from "react-router";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { openGalleryDb, closeGalleryDb } from "../app/lib/gallery-db.server";
import { createGallery, getGalleryById } from "../app/lib/gallery.server";
import {
  listGalleryVideoSources,
  deleteGalleryVideoSource,
  GalleryImportFileError,
  type VideoSourceCategory,
} from "../app/lib/gallery-import-files.server";
import {
  startGalleryImport,
  processImport,
  acquireNextJob,
} from "../app/lib/gallery-import.server";
import { action as adminGalleryAction } from "../app/routes/admin.galleries.$id";
import {
  initUploadSession,
  saveChunkStream,
  finalizeUpload,
  getUploadStatus,
  UploadValidationError,
} from "../app/lib/gallery-upload.server";
import { getFfmpegPath } from "../app/lib/gallery-video-preview.server";
import { ensureGalleryImportFolder } from "../app/lib/gallery-folder.server";
import { computeCredentialVersion } from "../app/lib/auth.server";
import { ENV } from "../app/lib/env.server";
import { commitSession, getSession } from "../app/lib/session.server";
import { Readable } from "node:stream";

describe("Gallery Video Management, Multi-Import & Deletion Isolation", () => {
  let tmpDir: string;
  let mediaBase: string;
  let importBase: string;
  let dbPath: string;
  let galleryId: string;
  let galleryFolderName: string;
  let galleryImportDir: string;
  let ffmpegBin: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gallery-video-mgmt-test-")));
    mediaBase = path.join(tmpDir, "media");
    importBase = path.join(tmpDir, "imports");
    dbPath = path.join(tmpDir, "gallery.db");

    fs.mkdirSync(mediaBase, { recursive: true, mode: 0o700 });
    fs.mkdirSync(importBase, { recursive: true, mode: 0o700 });

    vi.spyOn(ENV, "GALLERY_DB_PATH", "get").mockReturnValue(dbPath);
    vi.spyOn(ENV, "GALLERY_MEDIA_PATH", "get").mockReturnValue(mediaBase);
    vi.spyOn(ENV, "GALLERY_IMPORT_PATH", "get").mockReturnValue(importBase);
    vi.spyOn(ENV, "ADMIN_SESSION_SECRET", "get").mockReturnValue("test-secret-at-least-32-chars-long-1234567890");

    openGalleryDb(dbPath);

    const created = createGallery({
      bride_names: "Sarah & David",
      wedding_date: "2026-10-10",
      expires_at: Date.now() + 86400000,
    });
    galleryId = created.id;

    // Canonical folder for imports
    const folderInfo = ensureGalleryImportFolder(galleryId);
    galleryFolderName = folderInfo.folderName;
    galleryImportDir = folderInfo.folderPath;
    fs.mkdirSync(path.join(galleryImportDir, "videos"), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(galleryImportDir, "invites", "videos"), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(galleryImportDir, "maries", "videos"), { recursive: true, mode: 0o700 });

    ffmpegBin = getFfmpegPath() || "/opt/homebrew/bin/ffmpeg";
  });

  afterEach(() => {
    closeGalleryDb();
    vi.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function createSyntheticVideoFile(targetPath: string, frequency: number, duration = 0.5) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    execFileSync(
      ffmpegBin,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc=duration=${duration}:size=320x240:rate=25`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=${frequency}:duration=${duration}`,
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-f",
        "mp4",
        targetPath,
      ],
      { stdio: "ignore" }
    );
  }

  async function runImportJob(galId: string, folder: string) {
    startGalleryImport(galId, folder);
    const job = acquireNextJob();
    if (!job) throw new Error("No job acquired");
    await processImport(job.id, job.gallery_id, job.import_path, job.lease_token);
    const db = openGalleryDb(dbPath);
    const row = db.prepare("SELECT result_json FROM gallery_imports WHERE id = ?").get(job.id) as { result_json: string };
    return JSON.parse(row.result_json);
  }

  async function createAdminCookie(): Promise<string> {
    vi.spyOn(ENV, "ADMIN_PASSWORD_HASH", "get").mockReturnValue("$argon2id$v=19$m=65536,t=3,p=4$dummyhash$dummyhash");
    const session = await getSession();
    session.set("adminId", "admin");
    session.set("credentialVersion", computeCredentialVersion());
    session.set("csrfToken", "test-csrf-token");
    return commitSession(session);
  }

  it("handles multi-video import: imports 2 distinct videos, identifies duplicate content with exact reason, and allows resume without duplicates", async () => {
    const video1Path = path.join(galleryImportDir, "videos", "first-dance.mp4");
    const video2Path = path.join(galleryImportDir, "videos", "speeches.mp4");
    const duplicatePath = path.join(galleryImportDir, "videos", "first-dance-copy.mp4");

    // Create 2 distinctly different videos (different sine frequency creates different audio hash)
    createSyntheticVideoFile(video1Path, 440, 0.5);
    createSyntheticVideoFile(video2Path, 880, 0.5);

    // Create an exact duplicate with different filename
    fs.copyFileSync(video1Path, duplicatePath);

    // Launch import
    const result = await runImportJob(galleryId, galleryFolderName);

    // Verify breakdown counts
    expect(result.transferred).toBe(3);
    expect(result.imported).toBe(2);
    expect(result.duplicates.length).toBe(1);
    expect(result.duplicates[0].reason).toContain("Doublon (même contenu exact)");
    expect([
      "first-dance.mp4",
      "first-dance-copy.mp4",
      path.join("videos", "first-dance.mp4"),
      path.join("videos", "first-dance-copy.mp4"),
    ]).toContain(result.duplicates[0].file);
    expect(result.rejected.length).toBe(0);
    expect(result.errors.length).toBe(0);

    // Verify database has exactly 2 videos
    const db = openGalleryDb(dbPath);
    const dbVideos = db.prepare("SELECT original_name, hash FROM gallery_media WHERE gallery_id = ?").all(galleryId) as Array<{ original_name: string; hash: string }>;
    expect(dbVideos.length).toBe(2);
    const names = dbVideos.map(v => v.original_name);
    expect(names).toContain("speeches.mp4");
    expect(names.some(n => n.startsWith("first-dance"))).toBe(true);

    // Resume / re-import the same folder: should add 0 new media, and report all 3 as duplicates
    const resumeResult = await runImportJob(galleryId, galleryFolderName);
    expect(resumeResult.imported).toBe(0);
    expect(resumeResult.duplicates.length).toBe(3);
    expect(db.prepare("SELECT COUNT(*) as c FROM gallery_media WHERE gallery_id = ?").get(galleryId)).toEqual({ c: 2 });
  });

  it("preserves maries visibility on re-import and never broadens to invites", async () => {
    const coupleVideoPath = path.join(galleryImportDir, "maries", "videos", "private-moment.mp4");
    createSyntheticVideoFile(coupleVideoPath, 550, 0.5);

    await runImportJob(galleryId, galleryFolderName);

    const db = openGalleryDb(dbPath);
    const mediaRow = db.prepare("SELECT id, visibility FROM gallery_media WHERE gallery_id = ?").get(galleryId) as { id: string; visibility: string } | undefined;
    expect(mediaRow?.visibility).toBe("maries");

    // Re-importing must preserve maries visibility
    await runImportJob(galleryId, galleryFolderName);

    const mediaRowAfter = db.prepare("SELECT id, visibility FROM gallery_media WHERE gallery_id = ?").get(galleryId) as { id: string; visibility: string } | undefined;
    expect(mediaRowAfter?.visibility).toBe("maries");
  });

  it("executes 'Supprimer de la galerie': removes DB row and derivatives, leaves source file intact on Mac mini, and reverts empty published gallery to draft", async () => {
    const videoSource = path.join(galleryImportDir, "videos", "party.mp4");
    createSyntheticVideoFile(videoSource, 600, 0.5);

    await runImportJob(galleryId, galleryFolderName);

    const db = openGalleryDb(dbPath);
    const media = db.prepare("SELECT id FROM gallery_media WHERE gallery_id = ?").get(galleryId) as { id: string };

    // Publish the gallery
    db.prepare("UPDATE galleries SET status = 'published' WHERE id = ?").run(galleryId);

    // Create derivative files in GALLERY_MEDIA_PATH
    const mediaFile = path.join(mediaBase, galleryId, media.id);
    const posterFile = path.join(mediaBase, galleryId, ".posters", media.id);
    const previewFile = path.join(mediaBase, galleryId, ".previews", media.id, "video-v1.mp4");
    fs.mkdirSync(path.dirname(posterFile), { recursive: true });
    fs.mkdirSync(path.dirname(previewFile), { recursive: true });
    fs.writeFileSync(posterFile, Buffer.from("poster"));
    fs.writeFileSync(previewFile, Buffer.from("preview"));

    expect(fs.existsSync(mediaFile)).toBe(true);
    expect(fs.existsSync(posterFile)).toBe(true);
    expect(fs.existsSync(previewFile)).toBe(true);
    expect(fs.existsSync(videoSource)).toBe(true);

    // Call admin delete_media action
    const adminCookie = await createAdminCookie();
    const body = new URLSearchParams({
      csrfToken: "test-csrf-token",
      intent: "delete_media",
      mediaIds: media.id,
    }).toString();

    const req = new Request(`http://localhost/admin/galleries/${galleryId}`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        Origin: "http://localhost",
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": String(Buffer.byteLength(body)),
      },
      body,
    });

    const res = await adminGalleryAction({ request: req, params: { id: galleryId } } as unknown as ActionFunctionArgs);
    expect(res.status).toBe(200);

    // DB row is deleted
    expect(db.prepare("SELECT COUNT(*) as c FROM gallery_media WHERE gallery_id = ?").get(galleryId)).toEqual({ c: 0 });

    // Derivatives are removed
    expect(fs.existsSync(mediaFile)).toBe(false);
    expect(fs.existsSync(posterFile)).toBe(false);
    expect(fs.existsSync(previewFile)).toBe(false);

    // Source file on the Mac mini is strictly preserved!
    expect(fs.existsSync(videoSource)).toBe(true);

    // Published gallery reverted to draft because it became empty
    const updatedGallery = getGalleryById(galleryId);
    expect(updatedGallery?.status).toBe("draft");
  });

  it("executes 'Supprimer du Mac mini': lists sources, removes source only, keeps published gallery copy intact, and cleans upload receipts", async () => {
    const videoSource = path.join(galleryImportDir, "videos", "original-master.mp4");
    createSyntheticVideoFile(videoSource, 700, 0.5);
    const videoBytes = fs.readFileSync(videoSource);

    // Also simulate an upload session and finalized receipt for this file
    const uploadSession = initUploadSession(galleryId, {
      destination: "guest_videos",
      fileName: "original-master.mp4",
      fileSize: videoBytes.length,
      totalChunks: 1,
    });
    await saveChunkStream(galleryId, uploadSession.uploadId, 0, Readable.from(videoBytes));
    await finalizeUpload(galleryId, uploadSession.uploadId);
    expect(getUploadStatus(galleryId, uploadSession.uploadId).finalized).toBe(true);

    // Import into gallery
    await runImportJob(galleryId, galleryFolderName);

    const db = openGalleryDb(dbPath);
    const media = db.prepare("SELECT id FROM gallery_media WHERE gallery_id = ?").get(galleryId) as { id: string };
    const galleryCopyPath = path.join(mediaBase, galleryId, media.id);
    expect(fs.existsSync(galleryCopyPath)).toBe(true);

    // List sources on Mac mini
    const sources = listGalleryVideoSources(galleryFolderName);
    expect(sources.length).toBeGreaterThan(0);
    const targetSource = sources.find(s => s.name === "original-master.mp4" && s.category === "guest_videos");
    expect(targetSource).toBeDefined();
    expect(targetSource!.category).toBe("guest_videos");
    expect(targetSource!.categoryLabel).toContain("Invités");
    expect(targetSource!.version).toBeDefined();

    // Call deleteGalleryVideoSource
    const uploadedFilePath = path.join(galleryImportDir, "invites", "videos", "original-master.mp4");
    expect(fs.existsSync(uploadedFilePath)).toBe(true);

    deleteGalleryVideoSource(galleryId, targetSource!.category, targetSource!.name, targetSource!.version);

    // Source file on Mac mini is gone
    expect(fs.existsSync(uploadedFilePath)).toBe(false);

    // Published gallery copy is still completely intact!
    expect(fs.existsSync(galleryCopyPath)).toBe(true);

    // Upload receipt and temporary session directory were completely cleaned up
    expect(() => getUploadStatus(galleryId, uploadSession.uploadId)).toThrow(UploadValidationError);

    // Deleting a source that has no DB entry (e.g. unimported file) works cleanly
    const extraSource = path.join(galleryImportDir, "maries", "videos", "unimported.mp4");
    createSyntheticVideoFile(extraSource, 350, 0.5);
    const extraSources = listGalleryVideoSources(galleryFolderName);
    const unimportedTarget = extraSources.find(s => s.name === "unimported.mp4");
    expect(unimportedTarget).toBeDefined();

    deleteGalleryVideoSource(galleryId, unimportedTarget!.category, unimportedTarget!.name, unimportedTarget!.version);
    expect(fs.existsSync(extraSource)).toBe(false);
  });

  it("strictly enforces anti-traversal, version checks, and foreign directory protection on Mac mini deletion", () => {
    // 1. Path traversal attempt
    expect(() => {
      deleteGalleryVideoSource(galleryId, "root_videos", "../secret.mp4", "any-version");
    }).toThrow(GalleryImportFileError);

    // 2. Unknown category
    expect(() => {
      deleteGalleryVideoSource(galleryId, "invalid_cat" as unknown as VideoSourceCategory, "file.mp4", "any-version");
    }).toThrow(GalleryImportFileError);

    // 3. Version token mismatch (file modified or replaced since display)
    const videoSource = path.join(galleryImportDir, "videos", "version-check.mp4");
    createSyntheticVideoFile(videoSource, 400, 0.5);

    expect(() => {
      deleteGalleryVideoSource(galleryId, "root_videos", "version-check.mp4", "wrong-token");
    }).toThrow(GalleryImportFileError);
  });
});
