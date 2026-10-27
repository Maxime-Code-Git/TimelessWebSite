import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Readable } from "node:stream";
import sharp from "sharp";
import { openGalleryDb, closeGalleryDb } from "../app/lib/gallery-db.server";
import { createGallery } from "../app/lib/gallery.server";
import {
  initUploadSession,
  saveChunkStream,
  getUploadStatus,
  finalizeUpload,
  cancelUpload,
  cleanupAbandonedUploads,
  checkDiskSpace,
  diskChecker,
  DiskSpaceError,
  detectMimeType,
} from "../app/lib/gallery-upload.server";
import { getImportPreview, startGalleryImport, processImport, acquireNextJob } from "../app/lib/gallery-import.server";
import { ENV } from "../app/lib/env.server";

describe("Gallery Upload Server Logic (Feature 2)", () => {
  let tmpDir: string;
  let importBase: string;
  let mediaBase: string;
  let dbPath: string;
  let galleryId: string;
  let galleryFolder: string;

  beforeEach(async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gallery-upload-test-")));
    importBase = path.join(tmpDir, "imports");
    mediaBase = path.join(tmpDir, "media");
    dbPath = path.join(tmpDir, "gallery.db");

    fs.mkdirSync(importBase, { recursive: true, mode: 0o700 });
    fs.mkdirSync(mediaBase, { recursive: true, mode: 0o700 });

    vi.spyOn(ENV, "GALLERY_DB_PATH", "get").mockReturnValue(dbPath);
    vi.spyOn(ENV, "GALLERY_IMPORT_PATH", "get").mockReturnValue(importBase);
    vi.spyOn(ENV, "GALLERY_MEDIA_PATH", "get").mockReturnValue(mediaBase);

    openGalleryDb(dbPath);

    const gal = createGallery({
      bride_names: "Laure & Maxime",
      wedding_date: "2026-08-15",
    });
    galleryId = gal.id;
    galleryFolder = gal.upload_folder!;
  });

  afterEach(() => {
    closeGalleryDb();
    vi.restoreAllMocks();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("Real Signature Validation (detectMimeType)", () => {
    it("should accurately detect valid images by magic bytes", async () => {
      const jpegBuf = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } } }).jpeg().toBuffer();
      expect(detectMimeType(jpegBuf)).toBe("image/jpeg");

      const pngBuf = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 255, b: 0 } } }).png().toBuffer();
      expect(detectMimeType(pngBuf)).toBe("image/png");

      const webpBuf = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 255 } } }).webp().toBuffer();
      expect(detectMimeType(webpBuf)).toBe("image/webp");
    });

    it("should accurately detect valid MP4 and WebM videos by magic bytes", () => {
      const mp4Buf = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.from("data")]);
      expect(detectMimeType(mp4Buf)).toBe("video/mp4");

      const webmBuf = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      expect(detectMimeType(webmBuf)).toBe("video/webm");
    });

    it("should reject corrupted or text files", () => {
      const textBuf = Buffer.from("This is plain text and definitely not an image.");
      expect(detectMimeType(textBuf)).toBeNull();
    });
  });

  describe("Strict Distinction Between Photos and Videos", () => {
    it("should reject a video uploaded as a photo", async () => {
      const mp4Content = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(100)]);
      const session = initUploadSession(galleryId, {
        target: "photos",
        fileName: "fake-photo.jpg",
        fileSize: mp4Content.length,
        totalChunks: 1,
        chunkSize: mp4Content.length,
      });

      await saveChunkStream(galleryId, session.uploadId, 0, Readable.from(mp4Content));

      await expect(finalizeUpload(galleryId, session.uploadId)).rejects.toThrow("n'est pas une image supportée");
    });

    it("should reject a photo uploaded as a video", async () => {
      const jpegBuf = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } } }).jpeg().toBuffer();
      const session = initUploadSession(galleryId, {
        target: "videos",
        fileName: "fake-video.mp4",
        fileSize: jpegBuf.length,
        totalChunks: 1,
        chunkSize: jpegBuf.length,
      });

      await saveChunkStream(galleryId, session.uploadId, 0, Readable.from(jpegBuf));

      await expect(finalizeUpload(galleryId, session.uploadId)).rejects.toThrow("n'est pas une vidéo supportée");
    });
  });

  describe("Chunk Assembly, Invisibility Before Finalization & Atomicity", () => {
    it("should keep temporary files invisible in photos/ until finalized, then assemble correctly", async () => {
      const jpegBuf = await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 120, g: 200, b: 50 } } }).jpeg().toBuffer();

      // Split into 3 chunks
      const chunkSize = Math.ceil(jpegBuf.length / 3);
      const totalChunks = Math.ceil(jpegBuf.length / chunkSize);

      const session = initUploadSession(galleryId, {
        target: "photos",
        fileName: "assembled-test.jpg",
        fileSize: jpegBuf.length,
        totalChunks,
        chunkSize,
      });

      const photosDir = path.join(importBase, galleryFolder, "photos");

      // Upload chunks 0, 1, 2
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, jpegBuf.length);
        const chunk = jpegBuf.subarray(start, end);

        await saveChunkStream(galleryId, session.uploadId, i, Readable.from(chunk));

        // CRITICAL: Ensure the file is NOT yet visible in the destination folder
        expect(fs.existsSync(path.join(photosDir, "assembled-test.jpg"))).toBe(false);
      }

      // Now finalize
      const result = await finalizeUpload(galleryId, session.uploadId);
      expect(result.success).toBe(true);
      expect(result.fileName).toBe("assembled-test.jpg");

      // Now the file MUST be in photos/ and have identical content
      const finalFile = path.join(photosDir, "assembled-test.jpg");
      expect(fs.existsSync(finalFile)).toBe(true);
      const onDiskBuf = fs.readFileSync(finalFile);
      expect(onDiskBuf.equals(jpegBuf)).toBe(true);

      // Verify permissions are 0600
      const stat = fs.statSync(finalFile);
      expect(stat.mode & 0o777).toBe(0o600);

      // Verify temporary upload folder was cleaned up
      const uploadDir = path.join(importBase, galleryFolder, ".tmp_uploads", session.uploadId);
      expect(fs.existsSync(uploadDir)).toBe(false);
    });
  });

  describe("Resumption After Interruption", () => {
    it("should allow resuming an interrupted upload without resending completed chunks", async () => {
      const data = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(1000 - 12)]);
      const chunkSize = 250;
      const totalChunks = 4;

      const session = initUploadSession(galleryId, {
        target: "videos",
        fileName: "resume-test.mp4",
        fileSize: data.length,
        totalChunks,
        chunkSize,
      });

      // Send chunk 0 and chunk 1
      await saveChunkStream(galleryId, session.uploadId, 0, Readable.from(data.subarray(0, 250)));
      await saveChunkStream(galleryId, session.uploadId, 1, Readable.from(data.subarray(250, 500)));

      // Simulate client disconnect and query status
      const status = getUploadStatus(galleryId, session.uploadId);
      expect(status.totalChunks).toBe(4);
      expect(status.uploadedChunks).toEqual([0, 1]);

      // Client now only needs to send chunks 2 and 3!
      await saveChunkStream(galleryId, session.uploadId, 2, Readable.from(data.subarray(500, 750)));
      await saveChunkStream(galleryId, session.uploadId, 3, Readable.from(data.subarray(750, data.length)));

      // Finalize should succeed
      const fin = await finalizeUpload(galleryId, session.uploadId);
      expect(fin.success).toBe(true);
      const destFile = path.join(importBase, galleryFolder, "videos", "resume-test.mp4");
      expect(fs.existsSync(destFile)).toBe(true);
      expect(fs.readFileSync(destFile).equals(data)).toBe(true);
    });
  });

  describe("Replayed Requests & Duplication Prevention", () => {
    it("should not create duplicate files if the exact same file is uploaded twice", async () => {
      const jpegBuf = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 50, g: 50, b: 50 } } }).jpeg().toBuffer();

      // First upload
      const s1 = initUploadSession(galleryId, {
        target: "photos",
        fileName: "replay.jpg",
        fileSize: jpegBuf.length,
        totalChunks: 1,
        chunkSize: jpegBuf.length,
      });
      await saveChunkStream(galleryId, s1.uploadId, 0, Readable.from(jpegBuf));
      const res1 = await finalizeUpload(galleryId, s1.uploadId);
      expect(res1.fileName).toBe("replay.jpg");

      // Second upload with the same content and name (replayed)
      const s2 = initUploadSession(galleryId, {
        target: "photos",
        fileName: "replay.jpg",
        fileSize: jpegBuf.length,
        totalChunks: 1,
        chunkSize: jpegBuf.length,
      });
      await saveChunkStream(galleryId, s2.uploadId, 0, Readable.from(jpegBuf));
      const res2 = await finalizeUpload(galleryId, s2.uploadId);
      expect(res2.fileName).toBe("replay.jpg");
      expect(res2.alreadyExists).toBe(true);

      // Verify only ONE file exists in the directory
      const files = fs.readdirSync(path.join(importBase, galleryFolder, "photos"));
      expect(files).toEqual(["replay.jpg"]);
    });

    it("should rename to unique suffix if a file with same name but different content is uploaded", async () => {
      const jpegBuf1 = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 10, g: 10, b: 10 } } }).jpeg().toBuffer();
      const jpegBuf2 = await sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 99, g: 99, b: 99 } } }).jpeg().toBuffer();

      const s1 = initUploadSession(galleryId, {
        target: "photos",
        fileName: "photo.jpg",
        fileSize: jpegBuf1.length,
        totalChunks: 1,
      });
      await saveChunkStream(galleryId, s1.uploadId, 0, Readable.from(jpegBuf1));
      await finalizeUpload(galleryId, s1.uploadId);

      const s2 = initUploadSession(galleryId, {
        target: "photos",
        fileName: "photo.jpg",
        fileSize: jpegBuf2.length,
        totalChunks: 1,
      });
      await saveChunkStream(galleryId, s2.uploadId, 0, Readable.from(jpegBuf2));
      const res2 = await finalizeUpload(galleryId, s2.uploadId);

      expect(res2.fileName).toBe("photo (1).jpg");

      const files = fs.readdirSync(path.join(importBase, galleryFolder, "photos"));
      expect(files.sort()).toEqual(["photo (1).jpg", "photo.jpg"]);
    });
  });

  describe("Temporary Upload Cleanup", () => {
    it("should cancel an active upload and remove its temporary directory", () => {
      const session = initUploadSession(galleryId, {
        target: "photos",
        fileName: "cancel.jpg",
        fileSize: 100,
        totalChunks: 1,
      });

      const uploadDir = path.join(importBase, galleryFolder, ".tmp_uploads", session.uploadId);
      expect(fs.existsSync(uploadDir)).toBe(true);

      cancelUpload(galleryId, session.uploadId);
      expect(fs.existsSync(uploadDir)).toBe(false);
    });

    it("should clean up abandoned upload sessions older than max age", () => {
      const session = initUploadSession(galleryId, {
        target: "photos",
        fileName: "abandoned.jpg",
        fileSize: 100,
        totalChunks: 1,
      });

      const uploadDir = path.join(importBase, galleryFolder, ".tmp_uploads", session.uploadId);
      expect(fs.existsSync(uploadDir)).toBe(true);

      // Simulate expired meta (older than 24h)
      const metaPath = path.join(uploadDir, "meta.json");
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      meta.createdAt = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      fs.writeFileSync(metaPath, JSON.stringify(meta));

      const folderPath = path.join(importBase, galleryFolder);
      cleanupAbandonedUploads(folderPath);

      expect(fs.existsSync(uploadDir)).toBe(false);
    });
  });

  describe("Disk Space Verification", () => {
    it("should throw DiskSpaceError when available space is insufficient", () => {
      // Mock statfs to simulate low disk space
      vi.spyOn(diskChecker, "statfs").mockReturnValue({
        bavail: 100,
        bsize: 1024,
        bfree: 100,
        blocks: 10000,
      } as unknown as ReturnType<typeof diskChecker.statfs>);

      expect(() => checkDiskSpace(tmpDir, 500 * 1024 * 1024)).toThrow(DiskSpaceError);
    });
  });

  describe("Integration with Legacy Importer & Pipeline", () => {
    it("should allow getImportPreview and processImport to process uploaded photos and videos in photos/ and videos/", async () => {
      const jpegBuf = await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 200, g: 10, b: 10 } } }).jpeg().toBuffer();
      const mp4Buf = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(100)]);

      // Upload 1 photo
      const sPhoto = initUploadSession(galleryId, {
        target: "photos",
        fileName: "gallery-pic.jpg",
        fileSize: jpegBuf.length,
        totalChunks: 1,
      });
      await saveChunkStream(galleryId, sPhoto.uploadId, 0, Readable.from(jpegBuf));
      await finalizeUpload(galleryId, sPhoto.uploadId);

      // Upload 1 video
      const sVideo = initUploadSession(galleryId, {
        target: "videos",
        fileName: "gallery-clip.mp4",
        fileSize: mp4Buf.length,
        totalChunks: 1,
      });
      await saveChunkStream(galleryId, sVideo.uploadId, 0, Readable.from(mp4Buf));
      await finalizeUpload(galleryId, sVideo.uploadId);

      // Run existing importer preview on the gallery's automatic folder
      const preview = await getImportPreview(galleryFolder);
      expect(preview.invitesPhotosCount).toBe(1);
      expect(preview.invitesVideosCount).toBe(1);
      expect(preview.total).toBe(2);

      // Run processImport using existing worker pipeline
      process.env.__TEST_DISABLE_WORKER = "true";
      startGalleryImport(galleryId, galleryFolder);
      const job = acquireNextJob();
      expect(job).toBeDefined();
      await processImport(job!.id, job!.gallery_id, job!.import_path, job!.lease_token);

      // Verify media records exist in DB
      const db = openGalleryDb(dbPath);
      const media = db.prepare("SELECT * FROM gallery_media WHERE gallery_id = ?").all(galleryId) as Record<string, unknown>[];
      expect(media.length).toBe(2);
      const types = media.map(m => m.type);
      expect(types).toContain("photo");
      expect(types).toContain("video");
    });
  });
});
