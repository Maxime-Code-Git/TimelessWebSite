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
  computeAllActiveDiskReservations,
  uploadLock,
  diskChecker,
  DiskSpaceError,
  UploadValidationError,
  MAX_PHOTO_SIZE,
  MAX_VIDEO_SIZE,
  MAX_CHUNK_SIZE,
  detectMimeType,
  isUploadDestination,
  UPLOAD_DESTINATIONS,
  type UploadDestination,
} from "../app/lib/gallery-upload.server";
import { getImportPreview, startGalleryImport, processImport, acquireNextJob } from "../app/lib/gallery-import.server";
import { ENV } from "../app/lib/env.server";

describe("Gallery Upload Server Logic (Feature 2 & Post-Production Audience & Reliability Fixes)", () => {
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

  describe("Destination Validation and Secure Folder Mapping", () => {
    it("should validate all 4 destinations and reject invalid values with 400", () => {
      const validDestinations: UploadDestination[] = [
        "guest_photos",
        "guest_videos",
        "couple_photos",
        "couple_videos",
      ];

      for (const dest of validDestinations) {
        expect(isUploadDestination(dest)).toBe(true);
        expect(UPLOAD_DESTINATIONS[dest]).toBeDefined();
        expect(typeof UPLOAD_DESTINATIONS[dest].folder).toBe("string");
      }

      // Invalid / malicious destinations
      expect(isUploadDestination("photos")).toBe(false);
      expect(isUploadDestination("videos")).toBe(false);
      expect(isUploadDestination("admin")).toBe(false);
      expect(isUploadDestination("../../../etc/passwd")).toBe(false);
      expect(isUploadDestination("")).toBe(false);
      expect(isUploadDestination(null)).toBe(false);
      expect(isUploadDestination(undefined)).toBe(false);

      // Rejection with 400 on initUploadSession
      expect(() => {
        initUploadSession(galleryId, {
          destination: "unknown_dest" as UploadDestination,
          fileName: "test.jpg",
          fileSize: 1000,
          totalChunks: 1,
        });
      }).toThrow(UploadValidationError);

      try {
        initUploadSession(galleryId, {
          destination: "unknown_dest" as UploadDestination,
          fileName: "test.jpg",
          fileSize: 1000,
          totalChunks: 1,
        });
      } catch (err) {
        expect((err as UploadValidationError).status).toBe(400);
      }
    });

    it("should map destinations to canonical importer folders", () => {
      expect(UPLOAD_DESTINATIONS.guest_photos.folder).toBe("invites/photos");
      expect(UPLOAD_DESTINATIONS.guest_videos.folder).toBe("invites/videos");
      expect(UPLOAD_DESTINATIONS.couple_photos.folder).toBe("maries/photos");
      expect(UPLOAD_DESTINATIONS.couple_videos.folder).toBe("maries/videos");

      expect(UPLOAD_DESTINATIONS.guest_photos.visibility).toBe("invites");
      expect(UPLOAD_DESTINATIONS.guest_videos.visibility).toBe("invites");
      expect(UPLOAD_DESTINATIONS.couple_photos.visibility).toBe("maries");
      expect(UPLOAD_DESTINATIONS.couple_videos.visibility).toBe("maries");
    });
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
      const mp4Buf = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(20)]);
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
        destination: "guest_photos",
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
        destination: "guest_videos",
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
    it("should keep temporary files invisible in destination until finalized, then assemble correctly", async () => {
      const jpegBuf = await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 120, g: 200, b: 50 } } }).jpeg().toBuffer();

      // Split into 3 chunks
      const chunkSize = Math.ceil(jpegBuf.length / 3);
      const totalChunks = Math.ceil(jpegBuf.length / chunkSize);

      const session = initUploadSession(galleryId, {
        destination: "guest_photos",
        fileName: "assembled-test.jpg",
        fileSize: jpegBuf.length,
        totalChunks,
        chunkSize,
      });

      const photosDir = path.join(importBase, galleryFolder, "invites", "photos");

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

      // Now the file MUST be in invites/photos/ and have identical content
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

    it("should correctly place couple_photos into maries/photos and couple_videos into maries/videos", async () => {
      const jpegBuf = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
      const mp4Buf = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(100)]);

      // 1. Couple photo
      const sPhoto = initUploadSession(galleryId, {
        destination: "couple_photos",
        fileName: "couple.jpg",
        fileSize: jpegBuf.length,
        totalChunks: 1,
      });
      await saveChunkStream(galleryId, sPhoto.uploadId, 0, Readable.from(jpegBuf));
      const resPhoto = await finalizeUpload(galleryId, sPhoto.uploadId);
      expect(resPhoto.success).toBe(true);

      const couplePhotoPath = path.join(importBase, galleryFolder, "maries", "photos", "couple.jpg");
      expect(fs.existsSync(couplePhotoPath)).toBe(true);

      // 2. Couple video
      const sVideo = initUploadSession(galleryId, {
        destination: "couple_videos",
        fileName: "couple.mp4",
        fileSize: mp4Buf.length,
        totalChunks: 1,
      });
      await saveChunkStream(galleryId, sVideo.uploadId, 0, Readable.from(mp4Buf));
      const resVideo = await finalizeUpload(galleryId, sVideo.uploadId);
      expect(resVideo.success).toBe(true);

      const coupleVideoPath = path.join(importBase, galleryFolder, "maries", "videos", "couple.mp4");
      expect(fs.existsSync(coupleVideoPath)).toBe(true);

      // 3. Import preview must show 1 in mariesPhotosCount and 1 in mariesVideosCount
      const preview = await getImportPreview(galleryFolder);
      expect(preview.mariesPhotosCount).toBe(1);
      expect(preview.mariesVideosCount).toBe(1);
      expect(preview.invitesPhotosCount).toBe(0);
      expect(preview.invitesVideosCount).toBe(0);
      expect(preview.total).toBe(2);
    });
  });

  describe("Resumption After Interruption", () => {
    it("should allow resuming an interrupted upload without resending completed chunks", async () => {
      const data = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(1000 - 12)]);
      const chunkSize = 250;
      const totalChunks = 4;

      const session = initUploadSession(galleryId, {
        destination: "guest_videos",
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
      const destFile = path.join(importBase, galleryFolder, "invites", "videos", "resume-test.mp4");
      expect(fs.existsSync(destFile)).toBe(true);
      expect(fs.readFileSync(destFile).equals(data)).toBe(true);
    });
  });

  describe("Replayed Requests & Duplication Prevention", () => {
    it("should not create duplicate files if the exact same file is uploaded twice", async () => {
      const jpegBuf = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 50, g: 50, b: 50 } } }).jpeg().toBuffer();

      // First upload
      const s1 = initUploadSession(galleryId, {
        destination: "guest_photos",
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
        destination: "guest_photos",
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
      const files = fs.readdirSync(path.join(importBase, galleryFolder, "invites", "photos"));
      expect(files).toEqual(["replay.jpg"]);
    });

    it("should rename to unique suffix if a file with same name but different content is uploaded", async () => {
      const jpegBuf1 = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 10, g: 10, b: 10 } } }).jpeg().toBuffer();
      const jpegBuf2 = await sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 99, g: 99, b: 99 } } }).jpeg().toBuffer();

      const s1 = initUploadSession(galleryId, {
        destination: "guest_photos",
        fileName: "photo.jpg",
        fileSize: jpegBuf1.length,
        totalChunks: 1,
      });
      await saveChunkStream(galleryId, s1.uploadId, 0, Readable.from(jpegBuf1));
      await finalizeUpload(galleryId, s1.uploadId);

      const s2 = initUploadSession(galleryId, {
        destination: "guest_photos",
        fileName: "photo.jpg",
        fileSize: jpegBuf2.length,
        totalChunks: 1,
      });
      await saveChunkStream(galleryId, s2.uploadId, 0, Readable.from(jpegBuf2));
      const res2 = await finalizeUpload(galleryId, s2.uploadId);

      expect(res2.fileName).toBe("photo (1).jpg");

      const files = fs.readdirSync(path.join(importBase, galleryFolder, "invites", "photos"));
      expect(files.sort()).toEqual(["photo (1).jpg", "photo.jpg"]);
    });
  });

  describe("Temporary Upload Cleanup", () => {
    it("should cancel an active upload and remove its temporary directory", () => {
      const session = initUploadSession(galleryId, {
        destination: "guest_photos",
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
        destination: "guest_photos",
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
      meta.updatedAt = meta.createdAt;
      fs.writeFileSync(metaPath, JSON.stringify(meta));

      const folderPath = path.join(importBase, galleryFolder);
      cleanupAbandonedUploads(folderPath);

      expect(fs.existsSync(uploadDir)).toBe(false);
    });
  });

  describe("Disk Space Verification", () => {
    it("should throw DiskSpaceError when available space is insufficient", () => {
      vi.spyOn(diskChecker, "statfs").mockReturnValue({
        bavail: 100,
        bsize: 1024,
        bfree: 100,
        blocks: 10000,
      } as unknown as ReturnType<typeof diskChecker.statfs>);

      expect(() => checkDiskSpace(tmpDir, 500 * 1024 * 1024)).toThrow(DiskSpaceError);
    });

    it("should succeed receiving chunks but fail during finalizeUpload if disk space is insufficient for assembled file", async () => {
      const jpegBuf = await sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
      const chunkSize = Math.ceil(jpegBuf.length / 2);
      const session = initUploadSession(galleryId, {
        destination: "guest_photos",
        fileName: "peak-test.jpg",
        fileSize: jpegBuf.length,
        totalChunks: 2,
        chunkSize,
      });

      // Upload the 2 chunks successfully
      await saveChunkStream(galleryId, session.uploadId, 0, Readable.from(jpegBuf.subarray(0, chunkSize)));
      await saveChunkStream(galleryId, session.uploadId, 1, Readable.from(jpegBuf.subarray(chunkSize)));

      // Now simulate disk becoming full right before finalize (insufficient for assembled file)
      vi.spyOn(diskChecker, "statfs").mockReturnValue({
        bavail: 10,
        bsize: 1024,
        bfree: 10,
        blocks: 10000,
      } as unknown as ReturnType<typeof diskChecker.statfs>);

      // finalizeUpload must throw DiskSpaceError and not leave assembled.tmp
      await expect(finalizeUpload(galleryId, session.uploadId)).rejects.toThrow(DiskSpaceError);
      const folderPath = path.join(importBase, galleryFolder);
      const assembledPath = path.join(folderPath, ".tmp_uploads", session.uploadId, "assembled.tmp");
      expect(fs.existsSync(assembledPath)).toBe(false);
    });

    it("should prevent concurrent init calls from reserving the same disk space and allow second upload after cancellation", () => {
      vi.spyOn(diskChecker, "statfs").mockReturnValue({
        bavail: 150 * 1024,
        bsize: 1024,
        bfree: 150 * 1024,
        blocks: 1000 * 1024,
      } as unknown as ReturnType<typeof diskChecker.statfs>);

      const s1 = initUploadSession(galleryId, {
        destination: "guest_photos",
        fileName: "file1.jpg",
        fileSize: 40 * 1024 * 1024,
        totalChunks: 8,
      });
      expect(s1.uploadId).toBeDefined();

      // Second upload would fit individually, but cannot fit simultaneously
      expect(() => {
        initUploadSession(galleryId, {
          destination: "guest_photos",
          fileName: "file2.jpg",
          fileSize: 40 * 1024 * 1024,
          totalChunks: 8,
        });
      }).toThrow(DiskSpaceError);

      // Cancelling upload 1 frees its reservation
      cancelUpload(galleryId, s1.uploadId);

      // Now second upload succeeds!
      const s2 = initUploadSession(galleryId, {
        destination: "guest_photos",
        fileName: "file2.jpg",
        fileSize: 40 * 1024 * 1024,
        totalChunks: 8,
      });
      expect(s2.uploadId).toBeDefined();
    });

    it("should preserve disk reservations across restarts from existing meta.json", () => {
      vi.spyOn(diskChecker, "statfs").mockReturnValue({
        bavail: 150 * 1024,
        bsize: 1024,
        bfree: 150 * 1024,
        blocks: 1000 * 1024,
      } as unknown as ReturnType<typeof diskChecker.statfs>);

      initUploadSession(galleryId, {
        destination: "guest_photos",
        fileName: "existing-session.jpg",
        fileSize: 40 * 1024 * 1024,
        totalChunks: 8,
      });

      const reserved = computeAllActiveDiskReservations(importBase);
      expect(reserved).toBe(80 * 1024 * 1024);
    });
  });

  describe("Strict Server Bounds and Security Validations", () => {
    it("should reject negative, non-safe-integer or zero file sizes", () => {
      expect(() => initUploadSession(galleryId, { destination: "guest_photos", fileName: "test.jpg", fileSize: -10, totalChunks: 1 })).toThrow(UploadValidationError);
      expect(() => initUploadSession(galleryId, { destination: "guest_photos", fileName: "test.jpg", fileSize: 0, totalChunks: 1 })).toThrow(UploadValidationError);
      expect(() => initUploadSession(galleryId, { destination: "guest_photos", fileName: "test.jpg", fileSize: 1.5, totalChunks: 1 })).toThrow(UploadValidationError);
      expect(() => initUploadSession(galleryId, { destination: "guest_photos", fileName: "test.jpg", fileSize: NaN, totalChunks: 1 })).toThrow(UploadValidationError);
    });

    it("should reject photos exceeding MAX_PHOTO_SIZE", () => {
      expect(() => initUploadSession(galleryId, { destination: "guest_photos", fileName: "big.jpg", fileSize: MAX_PHOTO_SIZE + 1, totalChunks: 1 })).toThrow(UploadValidationError);
    });

    it("should reject videos exceeding MAX_VIDEO_SIZE", () => {
      expect(() => initUploadSession(galleryId, { destination: "guest_videos", fileName: "huge.mp4", fileSize: MAX_VIDEO_SIZE + 1, totalChunks: 1 })).toThrow(UploadValidationError);
    });

    it("should accept video size up to 20 GB (safe integer arithmetic)", () => {
      const twentyGB = 20 * 1024 * 1024 * 1024;
      expect(Number.isSafeInteger(twentyGB)).toBe(true);
      expect(twentyGB).toBe(21474836480);
      expect(MAX_VIDEO_SIZE).toBe(twentyGB);

      const totalChunks = Math.ceil(twentyGB / (5 * 1024 * 1024));
      expect(totalChunks).toBe(4096);

      vi.spyOn(diskChecker, "statfs").mockReturnValue({
        bavail: 100 * 1024 * 1024,
        bsize: 1024,
        bfree: 100 * 1024 * 1024,
        blocks: 200 * 1024 * 1024,
      } as unknown as ReturnType<typeof diskChecker.statfs>);

      const session = initUploadSession(galleryId, {
        destination: "guest_videos",
        fileName: "wedding-movie.mp4",
        fileSize: twentyGB,
        totalChunks,
      });
      expect(session.uploadId).toBeDefined();
      expect(session.totalChunks).toBe(4096);
    });

    it("should enforce maximum 2 active sessions per gallery and target", () => {
      const s1 = initUploadSession(galleryId, { destination: "guest_photos", fileName: "s1.jpg", fileSize: 100, totalChunks: 1 });
      const s2 = initUploadSession(galleryId, { destination: "guest_photos", fileName: "s2.jpg", fileSize: 100, totalChunks: 1 });
      expect(s1.uploadId).toBeDefined();
      expect(s2.uploadId).toBeDefined();

      // 3rd session on photos must be rejected with 429
      expect(() => {
        initUploadSession(galleryId, { destination: "guest_photos", fileName: "s3.jpg", fileSize: 100, totalChunks: 1 });
      }).toThrow(UploadValidationError);

      try {
        initUploadSession(galleryId, { destination: "guest_photos", fileName: "s3.jpg", fileSize: 100, totalChunks: 1 });
      } catch (err) {
        expect((err as UploadValidationError).status).toBe(429);
      }

      // But videos target still has available slots
      const sVideo = initUploadSession(galleryId, { destination: "guest_videos", fileName: "v1.mp4", fileSize: 100, totalChunks: 1 });
      expect(sVideo.uploadId).toBeDefined();

      // Cancelling s1 frees a photo slot
      cancelUpload(galleryId, s1.uploadId);
      const s3 = initUploadSession(galleryId, { destination: "guest_photos", fileName: "s3.jpg", fileSize: 100, totalChunks: 1 });
      expect(s3.uploadId).toBeDefined();
    });

    it("should prevent concurrent lock acquisition in uploadLock.runSync", () => {
      let innerRan = false;
      uploadLock.runSync(() => {
        expect(() => {
          uploadLock.runSync(() => {
            innerRan = true;
          });
        }).toThrow(UploadValidationError);
      });
      expect(innerRan).toBe(false);
      expect(uploadLock.isLocked).toBe(false);
    });

    it("should reject chunk size exceeding MAX_CHUNK_SIZE", () => {
      expect(() => initUploadSession(galleryId, { destination: "guest_photos", fileName: "test.jpg", fileSize: 1000, totalChunks: 1, chunkSize: MAX_CHUNK_SIZE + 1 })).toThrow(UploadValidationError);
    });

    it("should reject invalid chunk indices", async () => {
      const jpegBuf = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 50, g: 50, b: 50 } } }).jpeg().toBuffer();
      const session = initUploadSession(galleryId, {
        destination: "guest_photos",
        fileName: "bounds.jpg",
        fileSize: jpegBuf.length,
        totalChunks: 1,
        chunkSize: jpegBuf.length,
      });

      await expect(saveChunkStream(galleryId, session.uploadId, -1, Readable.from(jpegBuf))).rejects.toThrow(UploadValidationError);
      await expect(saveChunkStream(galleryId, session.uploadId, 1, Readable.from(jpegBuf))).rejects.toThrow(UploadValidationError);
    });

    it("should reject chunks with size mismatch", async () => {
      const jpegBuf = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 50, g: 50, b: 50 } } }).jpeg().toBuffer();
      const session = initUploadSession(galleryId, {
        destination: "guest_photos",
        fileName: "mismatch.jpg",
        fileSize: jpegBuf.length,
        totalChunks: 1,
        chunkSize: jpegBuf.length,
      });

      // Send only half the declared chunk size
      const truncated = jpegBuf.subarray(0, Math.floor(jpegBuf.length / 2));
      await expect(saveChunkStream(galleryId, session.uploadId, 0, Readable.from(truncated))).rejects.toThrow(UploadValidationError);

      // Verify truncated .part file was deleted
      const uploadDir = path.join(importBase, galleryFolder, ".tmp_uploads", session.uploadId);
      expect(fs.existsSync(path.join(uploadDir, "chunk_0.part"))).toBe(false);
      expect(fs.existsSync(path.join(uploadDir, "chunk_0"))).toBe(false);
    });

    it("should strictly bind uploadId to the gallery and reject access from another gallery", async () => {
      const gal2 = createGallery({
        bride_names: "Claire & David",
        wedding_date: "2026-10-10",
      });

      const jpegBuf = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 50, g: 50, b: 50 } } }).jpeg().toBuffer();
      const session = initUploadSession(galleryId, {
        destination: "guest_photos",
        fileName: "binding.jpg",
        fileSize: jpegBuf.length,
        totalChunks: 1,
        chunkSize: jpegBuf.length,
      });

      // Attacking gallery 2 trying to upload chunk to gallery 1's uploadId
      await expect(saveChunkStream(gal2.id, session.uploadId, 0, Readable.from(jpegBuf))).rejects.toThrow(UploadValidationError);
      await expect(finalizeUpload(gal2.id, session.uploadId)).rejects.toThrow(UploadValidationError);
      expect(() => getUploadStatus(gal2.id, session.uploadId)).toThrow(UploadValidationError);
    });

    it("should ensure import analysis never scans partial or temporary files", async () => {
      // Place dummy .part and .tmp files inside invites/photos
      const photosDir = path.join(importBase, galleryFolder, "invites", "photos");
      fs.mkdirSync(photosDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(photosDir, "test.jpg.part"), Buffer.from("partial chunk"));
      fs.writeFileSync(path.join(photosDir, "temp.tmp"), Buffer.from("temp assembly"));

      const preview = await getImportPreview(galleryFolder);
      expect(preview.invitesPhotosCount).toBe(0);
      expect(preview.total).toBe(0);
    });
  });

  describe("Integration with Legacy Importer & Pipeline", () => {
    it("should allow getImportPreview and processImport to process uploaded photos and videos in invites and maries", async () => {
      const jpegBuf = await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 200, g: 10, b: 10 } } }).jpeg().toBuffer();
      const mp4Buf = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(100)]);

      // Upload 1 guest photo
      const sPhoto = initUploadSession(galleryId, {
        destination: "guest_photos",
        fileName: "gallery-pic.jpg",
        fileSize: jpegBuf.length,
        totalChunks: 1,
      });
      await saveChunkStream(galleryId, sPhoto.uploadId, 0, Readable.from(jpegBuf));
      await finalizeUpload(galleryId, sPhoto.uploadId);

      // Upload 1 guest video
      const sVideo = initUploadSession(galleryId, {
        destination: "guest_videos",
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
      const visibilities = media.map(m => m.visibility);
      expect(visibilities.every(v => v === "invites")).toBe(true);
    });
  });
});
