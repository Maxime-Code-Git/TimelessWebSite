// @vitest-environment node
import type { LoaderFunctionArgs } from "react-router";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { openGalleryDb, closeGalleryDb } from "../app/lib/gallery-db.server";
import { createGallery } from "../app/lib/gallery.server";
import {
  generateGalleryVideoPreview,
  startGalleryVideoPreview,
  getGalleryVideoPreviewStatus,
  getFfmpegPath,
  acquireGlobalLock,
  releaseGlobalLock,
} from "../app/lib/gallery-video-preview.server";
import { loader as mediaLoader } from "../app/routes/api.gallery.$publicId.media.$mediaId";
import { loader as posterLoader } from "../app/routes/api.gallery.$publicId.media.$mediaId.poster";
import { ENV } from "../app/lib/env.server";
import { gallerySessionStorage } from "../app/lib/gallery-auth.server";

describe("Gallery Video Preview & Access Control", () => {
  let tmpDir: string;
  let mediaBase: string;
  let importBase: string;
  let dbPath: string;
  let galleryId: string;
  let publicId: string;
  let ffmpegBin: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gallery-video-preview-test-")));
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
      bride_names: "Alice & Bob",
      wedding_date: "2026-09-12",
      expires_at: Date.now() + 86400000,
    });
    galleryId = created.id;
    publicId = created.public_id;

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
    try {
      fs.unlinkSync("/tmp/gallery-video-preview.lock");
    } catch {
      // ignore
    }
  });

  function createSyntheticVideoFile(targetPath: string, duration = 1.0) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    execFileSync(
      ffmpegBin,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc=duration=${duration}:size=640x480:rate=25`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=1000:duration=${duration}`,
        "-c:v",
        "libx264",
        "-b:v",
        "4000k",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-f",
        "mp4",
        targetPath,
      ],
      { stdio: "ignore" }
    );
    // Pad original slightly to ensure it is significantly larger than compressed 720p crf 24 preview
    fs.appendFileSync(targetPath, Buffer.alloc(150 * 1024));
  }

  it("encodes real video fixture with FFmpeg: produces web MP4, faststart, leaves original intact", async () => {
    const mediaId = "video-test-1";
    const originalVideoPath = path.join(mediaBase, galleryId, mediaId);
    createSyntheticVideoFile(originalVideoPath, 0.5);

    const originalStats = fs.statSync(originalVideoPath);
    const originalHash = fs.readFileSync(originalVideoPath);

    const db = openGalleryDb(dbPath);
    db.prepare(`
      INSERT INTO gallery_media (id, gallery_id, type, visibility, original_name, hash, size, width, height, mime_type, created_at)
      VALUES (?, ?, 'video', 'invites', 'test.mp4', 'hash1', ?, 320, 240, 'video/mp4', ?)
    `).run(mediaId, galleryId, originalStats.size, Date.now());

    // Before generation, status is missing
    expect(getGalleryVideoPreviewStatus(galleryId, mediaId).state).toBe("missing");

    // Generate preview
    await generateGalleryVideoPreview(galleryId, mediaId);

    // Verify preview file exists
    const previewFile = path.join(mediaBase, galleryId, ".previews", mediaId, "video-v1.mp4");
    expect(fs.existsSync(previewFile)).toBe(true);
    const previewStats = fs.statSync(previewFile);
    expect(previewStats.size).toBeGreaterThan(0);

    // Verify faststart: read first 1024 bytes and verify 'ftyp' and 'moov' appear before large mdat
    const buf = fs.readFileSync(previewFile);
    const headerStr = buf.subarray(0, 1024).toString("binary");
    expect(headerStr.includes("ftyp")).toBe(true);
    expect(headerStr.includes("moov")).toBe(true);

    // Verify original file is completely unchanged
    const currentOriginalHash = fs.readFileSync(originalVideoPath);
    expect(currentOriginalHash.equals(originalHash)).toBe(true);

    // Verify status is now ready
    expect(getGalleryVideoPreviewStatus(galleryId, mediaId).state).toBe("ready");
  });

  it("handles missing FFmpeg gracefully without crashing", async () => {
    const mediaId = "video-test-no-ffmpeg";
    const originalVideoPath = path.join(mediaBase, galleryId, mediaId);
    createSyntheticVideoFile(originalVideoPath, 0.5);

    const originalStats = fs.statSync(originalVideoPath);

    const db = openGalleryDb(dbPath);
    db.prepare(`
      INSERT INTO gallery_media (id, gallery_id, type, visibility, original_name, hash, size, width, height, mime_type, created_at)
      VALUES (?, ?, 'video', 'invites', 'test.mp4', 'hash2', ?, 320, 240, 'video/mp4', ?)
    `).run(mediaId, galleryId, originalStats.size, Date.now());

    // Simulate missing ffmpeg binary via FFMPEG_PATH="disabled"
    vi.stubEnv("FFMPEG_PATH", "disabled");

    try {
      const startResult = startGalleryVideoPreview(galleryId, mediaId);
      expect(startResult).toBe("started");

      // Wait a tick for async background promise to reject
      await new Promise((r) => setTimeout(r, 100));

      const previewStatus = getGalleryVideoPreviewStatus(galleryId, mediaId);
      expect(previewStatus.state).toBe("failed");
      if (previewStatus.state === "failed") {
        expect(previewStatus.message).toContain("FFmpeg");
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("enforces machine-wide lock and allows retry after release", async () => {
    // Acquire machine lock
    const locked = acquireGlobalLock(galleryId, "media-1");
    expect(locked).toBe(true);

    // Another acquisition attempt is rejected as busy
    const busyLocked = acquireGlobalLock(galleryId, "media-2");
    expect(busyLocked).toBe(false);

    // Release lock
    releaseGlobalLock(galleryId, "media-1");

    // Now acquisition succeeds
    const reacquired = acquireGlobalLock(galleryId, "media-2");
    expect(reacquired).toBe(true);
    releaseGlobalLock(galleryId, "media-2");
  });

  it("supports Range requests: 200, 206, 416, HEAD, and representation stability", async () => {
    const mediaId = "video-range-test";
    const originalVideoPath = path.join(mediaBase, galleryId, mediaId);
    createSyntheticVideoFile(originalVideoPath, 0.5);

    const db = openGalleryDb(dbPath);
    db.prepare("UPDATE galleries SET status = 'published' WHERE id = ?").run(galleryId);
    db.prepare(`
      INSERT INTO gallery_media (id, gallery_id, type, visibility, original_name, hash, size, width, height, mime_type, created_at)
      VALUES (?, ?, 'video', 'invites', 'test.mp4', 'hash-range', ?, 320, 240, 'video/mp4', ?)
    `).run(mediaId, galleryId, fs.statSync(originalVideoPath).size, Date.now());

    // Generate preview
    await generateGalleryVideoPreview(galleryId, mediaId);

    const previewPath = path.join(mediaBase, galleryId, ".previews", mediaId, "video-v1.mp4");
    const previewSize = fs.statSync(previewPath).size;
    const originalSize = fs.statSync(originalVideoPath).size;

    // Create a guest session
    const session = await gallerySessionStorage.getSession();
    session.set("galleryId", galleryId);
    session.set("accessLevel", "invites");
    session.set("codeVersion", 1);
    const cookieHeader = await gallerySessionStorage.commitSession(session);

    // 1. Full request on preview (200)
    const req200 = new Request(`http://localhost/api/gallery/${publicId}/media/${mediaId}?variant=preview`, {
      headers: { Cookie: cookieHeader },
    });
    const res200 = await mediaLoader({ request: req200, params: { publicId, mediaId } } as unknown as LoaderFunctionArgs);
    expect(res200.status).toBe(200);
    expect(res200.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res200.headers.get("Content-Length")).toBe(String(previewSize));
    expect(res200.headers.get("Content-Type")).toBe("video/mp4");

    // 2. Partial request on preview (206)
    const req206 = new Request(`http://localhost/api/gallery/${publicId}/media/${mediaId}?variant=preview`, {
      headers: {
        Cookie: cookieHeader,
        Range: "bytes=0-99",
      },
    });
    const res206 = await mediaLoader({ request: req206, params: { publicId, mediaId } } as unknown as LoaderFunctionArgs);
    expect(res206.status).toBe(206);
    expect(res206.headers.get("Content-Range")).toBe(`bytes 0-99/${previewSize}`);
    expect(res206.headers.get("Content-Length")).toBe("100");
    const bytes206 = await res206.arrayBuffer();
    expect(bytes206.byteLength).toBe(100);

    // 3. Invalid Range on preview (416)
    const req416 = new Request(`http://localhost/api/gallery/${publicId}/media/${mediaId}?variant=preview`, {
      headers: {
        Cookie: cookieHeader,
        Range: `bytes=${previewSize + 1000}-`,
      },
    });
    const res416 = await mediaLoader({ request: req416, params: { publicId, mediaId } } as unknown as LoaderFunctionArgs);
    expect(res416.status).toBe(416);
    expect(res416.headers.get("Content-Range")).toBe(`bytes */${previewSize}`);

    // 4. HEAD request
    const reqHead = new Request(`http://localhost/api/gallery/${publicId}/media/${mediaId}?variant=preview`, {
      method: "HEAD",
      headers: { Cookie: cookieHeader },
    });
    const resHead = await mediaLoader({ request: reqHead, params: { publicId, mediaId } } as unknown as LoaderFunctionArgs);
    expect(resHead.status).toBe(200);
    expect(resHead.headers.get("Content-Length")).toBe(String(previewSize));

    // 5. Representation stability: original request serves original size, NOT preview size
    const reqOriginal = new Request(`http://localhost/api/gallery/${publicId}/media/${mediaId}`, {
      headers: { Cookie: cookieHeader },
    });
    const resOriginal = await mediaLoader({ request: reqOriginal, params: { publicId, mediaId } } as unknown as LoaderFunctionArgs);
    expect(resOriginal.status).toBe(200);
    expect(resOriginal.headers.get("Content-Length")).toBe(String(originalSize));
  });

  it("strictly enforces guest vs couple access controls on video preview, original, and poster", async () => {
    const mariesMediaId = "video-maries-only";
    const originalVideoPath = path.join(mediaBase, galleryId, mariesMediaId);
    createSyntheticVideoFile(originalVideoPath, 0.5);

    // Create a poster file
    const posterPath = path.join(mediaBase, galleryId, ".posters", mariesMediaId);
    fs.mkdirSync(path.dirname(posterPath), { recursive: true });
    fs.writeFileSync(posterPath, Buffer.from("fake-poster-data"));

    const originalStats = fs.statSync(originalVideoPath);

    const db = openGalleryDb(dbPath);
    db.prepare("UPDATE galleries SET status = 'published' WHERE id = ?").run(galleryId);
    db.prepare(`
      INSERT INTO gallery_media (id, gallery_id, type, visibility, original_name, hash, size, width, height, mime_type, poster_revision, created_at)
      VALUES (?, ?, 'video', 'maries', 'couple-dance.mp4', 'hash-maries', ?, 320, 240, 'video/mp4', 'rev1', ?)
    `).run(mariesMediaId, galleryId, originalStats.size, Date.now());

    await generateGalleryVideoPreview(galleryId, mariesMediaId);

    // Guest session (role = 'invites')
    const guestSession = await gallerySessionStorage.getSession();
    guestSession.set("galleryId", galleryId);
    guestSession.set("accessLevel", "invites");
    guestSession.set("codeVersion", 1);
    const guestCookie = await gallerySessionStorage.commitSession(guestSession);

    // 1. Guest accessing couple video preview -> throws 404 Response
    const guestPreviewReq = new Request(`http://localhost/api/gallery/${publicId}/media/${mariesMediaId}?variant=preview`, {
      headers: { Cookie: guestCookie },
    });
    await expect(
      mediaLoader({ request: guestPreviewReq, params: { publicId, mediaId: mariesMediaId } } as unknown as LoaderFunctionArgs)
    ).rejects.toMatchObject({ status: 404 });

    // 2. Guest accessing couple original video -> throws 404 Response
    const guestOrigReq = new Request(`http://localhost/api/gallery/${publicId}/media/${mariesMediaId}`, {
      headers: { Cookie: guestCookie },
    });
    await expect(
      mediaLoader({ request: guestOrigReq, params: { publicId, mediaId: mariesMediaId } } as unknown as LoaderFunctionArgs)
    ).rejects.toMatchObject({ status: 404 });

    // 3. Guest accessing couple poster -> throws 404 Response
    const guestPosterReq = new Request(`http://localhost/api/gallery/${publicId}/media/${mariesMediaId}/poster`, {
      headers: { Cookie: guestCookie },
    });
    await expect(
      posterLoader({ request: guestPosterReq, params: { publicId, mediaId: mariesMediaId } } as unknown as LoaderFunctionArgs)
    ).rejects.toMatchObject({ status: 404 });

    // Couple session (role = 'maries')
    const coupleSession = await gallerySessionStorage.getSession();
    coupleSession.set("galleryId", galleryId);
    coupleSession.set("accessLevel", "maries");
    coupleSession.set("codeVersion", 1);
    const coupleCookie = await gallerySessionStorage.commitSession(coupleSession);

    // 4. Couple accessing couple preview -> 200
    const couplePreviewReq = new Request(`http://localhost/api/gallery/${publicId}/media/${mariesMediaId}?variant=preview`, {
      headers: { Cookie: coupleCookie },
    });
    const couplePreviewRes = await mediaLoader({ request: couplePreviewReq, params: { publicId, mediaId: mariesMediaId } } as unknown as LoaderFunctionArgs);
    expect(couplePreviewRes.status).toBe(200);

    // 5. Couple accessing couple original -> 200
    const coupleOrigReq = new Request(`http://localhost/api/gallery/${publicId}/media/${mariesMediaId}`, {
      headers: { Cookie: coupleCookie },
    });
    const coupleOrigRes = await mediaLoader({ request: coupleOrigReq, params: { publicId, mediaId: mariesMediaId } } as unknown as LoaderFunctionArgs);
    expect(coupleOrigRes.status).toBe(200);
  });
});
