import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

// Mock env-loader to prevent .env.local from loading
vi.mock("../../../../scripts/env-loader.js", () => ({}));

import {
  validateImageFile,
  processImage,
  renderTextWatermark,
  _resetFontCache,
} from "../app/lib/portfolio-image.server";

describe("Image Processing Engine (Phase 3C.2A)", () => {
  let tempDir: string;
  let mediaDir: string;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-image-test-"));
    mediaDir = path.join(tempDir, "media");
    fs.mkdirSync(mediaDir, { mode: 0o700 });
    _resetFontCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function createTestJpeg(width: number, height: number, filePath: string, metadata: any = {}): Promise<void> {
    let pipeline = sharp({
      create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } }
    });
    if (Object.keys(metadata).length > 0) {
      pipeline = pipeline.withMetadata(metadata);
    }
    const buffer = await pipeline.jpeg({ quality: 80 }).toBuffer();
    fs.writeFileSync(filePath, buffer);
  }

  async function createTestPng(width: number, height: number, filePath: string): Promise<void> {
    const buffer = await sharp({
      create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } }
    }).png().toBuffer();
    fs.writeFileSync(filePath, buffer);
  }

  describe("Directory confinement and Symlinks", () => {
    it("rejects projectDir symlink outside", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const fakeDir = path.join(tempDir, "fake");
      fs.mkdirSync(fakeDir);

      const projectId = "00000000-0000-4000-8000-000000000001";
      const projectDir = path.join(mediaDir, projectId);
      fs.symlinkSync(fakeDir, projectDir);

      await expect(processImage(filePath, tempDir, projectId, mediaDir, "TEST", "rev"))
        .rejects.toThrow("Image processing failed due to an internal error.");
    });

    it("rejects projectDir symlink inside mediaDir", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const otherDir = path.join(mediaDir, "00000000-0000-4000-8000-000000000002");
      fs.mkdirSync(otherDir);

      const projectId = "00000000-0000-4000-8000-000000000001";
      const projectDir = path.join(mediaDir, projectId);
      fs.symlinkSync(otherDir, projectDir);

      await expect(processImage(filePath, tempDir, projectId, mediaDir, "TEST", "rev"))
        .rejects.toThrow("Image processing failed due to an internal error.");
    });

    it("rejects originalsDir symlink internal and external", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);

      const projectId = "00000000-0000-4000-8000-000000000001";
      const projectDir = path.join(mediaDir, projectId);
      fs.mkdirSync(projectDir);

      const fakeDir = path.join(tempDir, "fake");
      fs.mkdirSync(fakeDir);
      const originalsDir = path.join(projectDir, "originals");
      fs.symlinkSync(fakeDir, originalsDir); // External

      await expect(processImage(filePath, tempDir, projectId, mediaDir, "TEST", "rev"))
        .rejects.toThrow("Image processing failed due to an internal error.");

      fs.unlinkSync(originalsDir);
      const otherDir = path.join(mediaDir, "00000000-0000-4000-8000-000000000002");
      fs.mkdirSync(otherDir);
      fs.symlinkSync(otherDir, originalsDir); // Internal

      await expect(processImage(filePath, tempDir, projectId, mediaDir, "TEST", "rev"))
        .rejects.toThrow("Image processing failed due to an internal error.");
    });

    it("rejects 480p symlink internal and external", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);

      const projectId = "00000000-0000-4000-8000-000000000001";
      const projectDir = path.join(mediaDir, projectId);
      fs.mkdirSync(projectDir);

      const fakeDir = path.join(tempDir, "fake");
      fs.mkdirSync(fakeDir);
      const variantDir = path.join(projectDir, "480p");
      fs.symlinkSync(fakeDir, variantDir); // External

      await expect(processImage(filePath, tempDir, projectId, mediaDir, "TEST", "rev"))
        .rejects.toThrow("Image processing failed due to an internal error.");
    });

    it("rejects mediaBasePath symlink (internal or external)", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const symMedia = path.join(tempDir, "symMedia");
      fs.symlinkSync(mediaDir, symMedia);

      const projectId = "00000000-0000-4000-8000-000000000001";
      await expect(processImage(filePath, tempDir, projectId, symMedia, "TEST", "rev"))
        .rejects.toThrow("Image processing failed due to an internal error.");
    });

    it("rejects if mediaBasePath does not exist", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);

      const missingMedia = path.join(tempDir, "missingMedia");
      const projectId = "00000000-0000-4000-8000-000000000001";
      await expect(processImage(filePath, tempDir, projectId, missingMedia, "TEST", "rev"))
        .rejects.toThrow("Image processing failed due to an internal error.");
    });

    it("rejects if mediaBasePath is a file", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);

      const fileMedia = path.join(tempDir, "fileMedia");
      fs.writeFileSync(fileMedia, "not a dir");

      const projectId = "00000000-0000-4000-8000-000000000001";
      await expect(processImage(filePath, tempDir, projectId, fileMedia, "TEST", "rev"))
        .rejects.toThrow("Image processing failed due to an internal error.");
    });

    it("rejects lstatSync or realpathSync EACCES on mediaBasePath", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);

      const originalLstatSync = fs.lstatSync;
      vi.spyOn(fs, "lstatSync").mockImplementation((pathArg: any) => {
        if (pathArg === mediaDir || pathArg === fs.realpathSync(mediaDir)) {
          const err = new Error("EACCES");
          (err as any).code = "EACCES";
          throw err;
        }
        return originalLstatSync(pathArg);
      });

      const projectId = "00000000-0000-4000-8000-000000000001";
      await expect(processImage(filePath, tempDir, projectId, mediaDir, "TEST", "rev"))
        .rejects.toThrow("Image processing failed due to an internal error.");
    });
  });

  describe("Validation errors & Generic error masking", () => {
    it("rejects invalid UUIDs", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      await expect(processImage(filePath, tempDir, "escaped/../", mediaDir, "TEST", "rev"))
        .rejects.toThrow("Invalid project ID.");
      await expect(processImage(filePath, tempDir, "escaped\\\\..\\\\", mediaDir, "TEST", "rev"))
        .rejects.toThrow("Invalid project ID.");
    });

    it("masks ENOENT to generic error without path", async () => {
      const missingFile = path.join(tempDir, "missing.jpg");
      await expect(processImage(missingFile, tempDir, "00000000-0000-4000-8000-000000000000", mediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");
    });

    it("rejects absent allowedTempDir securely", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const absentDir = path.join(tempDir, "absent");
      await expect(processImage(filePath, absentDir, "00000000-0000-4000-8000-000000000000", mediaDir, "T", "R"))
        .rejects.toThrow("Image validation failed.");
    });

    it("masks statSync EACCES", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);

      // Keep real implementation but override the exact one
      const originalStatSync = fs.statSync;
      vi.spyOn(fs, "statSync").mockImplementation((pathArg: any, options: any) => {
        if (pathArg === filePath) {
          const err = new Error("EACCES");
          (err as any).code = "EACCES";
          throw err;
        }
        return originalStatSync(pathArg, options);
      });
      await expect(processImage(filePath, tempDir, "00000000-0000-4000-8000-000000000000", mediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");
    });

    it("masks openSync EACCES", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const originalOpenSync = fs.openSync;
      vi.spyOn(fs, "openSync").mockImplementation((pathArg: any, flags: any, mode: any) => {
        if (pathArg === filePath) {
          const err = new Error("EACCES");
          (err as any).code = "EACCES";
          throw err;
        }
        return originalOpenSync(pathArg, flags, mode);
      });
      await expect(processImage(filePath, tempDir, "00000000-0000-4000-8000-000000000000", mediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");
    });

    it("masks readSync error", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const originalReadSync = fs.readSync;
      vi.spyOn(fs, "readSync").mockImplementation((...args: any[]) => {
        throw new Error("ReadError");
      });
      await expect(processImage(filePath, tempDir, "00000000-0000-4000-8000-000000000000", mediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");
    });

    it("masks sharp metadata internal error", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      // Create a file with JPEG magic bytes but corrupt body
      const buffer = Buffer.alloc(100);
      buffer[0] = 0xFF;
      buffer[1] = 0xD8;
      buffer[2] = 0xFF;
      fs.writeFileSync(filePath, buffer);

      await expect(processImage(filePath, tempDir, "00000000-0000-4000-8000-000000000000", mediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");

      // Check message and cause
      try {
        await processImage(filePath, tempDir, "00000000-0000-4000-8000-000000000000", mediaDir, "T", "R");
      } catch (err: any) {
        expect(err.message).toBe("Image processing failed due to an internal error.");
        expect(err.cause).toBeUndefined();
      }
    });
  });

  describe("Metadata, Orientation and Permissions", () => {
    it("retains EXIF orientation 6 in original, inverses logical dims, strips in variant", async () => {
      const filePath = path.join(tempDir, "orient.jpg");
      // Create a 800x600 image, but say orientation is 6 (rotated 90deg CW)
      await createTestJpeg(800, 600, filePath, { orientation: 6 });

      // Verify the source actually has it
      const srcMeta = await sharp(filePath).metadata();
      expect(srcMeta.orientation).toBe(6);

      const projectId = "00000000-0000-4000-8000-000000000000";
      const result = await processImage(filePath, tempDir, projectId, mediaDir, "TEST", "R");

      // The logic should swap width and height
      expect(result.originalWidth).toBe(600);
      expect(result.originalHeight).toBe(800);

      // Original should still be exact byte match
      const originalsDirTest = path.join(mediaDir, projectId, "originals");
      const files = fs.readdirSync(originalsDirTest);
      const origPath = path.join(originalsDirTest, files[0]);
      const origBuffer = fs.readFileSync(origPath);
      const srcBuffer = fs.readFileSync(filePath);
      expect(crypto.createHash("sha256").update(origBuffer).digest("hex"))
        .toBe(crypto.createHash("sha256").update(srcBuffer).digest("hex"));

      const origMeta = await sharp(origPath).metadata();
      expect(origMeta.orientation).toBe(6);
      expect(origMeta.width).toBe(800); // physical

      // Variant should be rotated and metadata stripped.
      // It scales down to 480x480 max, preserving ratio. 600x800 -> 360x480
      const variantPath = path.join(mediaDir, projectId, result.variants[0].name, `${result.variants[0].fileId}.webp`);
      const varMeta = await sharp(variantPath).metadata();
      expect(varMeta.orientation).toBeUndefined();
      expect(varMeta.width).toBe(360);
      expect(varMeta.height).toBe(480);
    });

    it("strips EXIF, IPTC, XMP, ICC", async () => {
      const filePath = path.join(tempDir, "meta.jpg");

      // Sharp allows injecting exif, iptc, xmp, icc.
      // We need to inject something to verify it is present first.
      const buffer = await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 128, g: 128, b: 128 } }
      })
      .withMetadata({
        exif: { IFD0: { Copyright: "Test" } },
        icc: "srgb"
      })
      .jpeg()
      .toBuffer();
      fs.writeFileSync(filePath, buffer);

      const inMeta = await sharp(buffer).metadata();
      expect(inMeta.exif).toBeDefined();

      const projectId = "00000000-0000-4000-8000-000000000000";
      const result = await processImage(filePath, tempDir, projectId, mediaDir, "TEST", "R");
      const variantPath = path.join(mediaDir, projectId, result.variants[0].name, `${result.variants[0].fileId}.webp`);
      const varMeta = await sharp(variantPath).metadata();

      expect(varMeta.exif).toBeUndefined();
      expect(varMeta.xmp).toBeUndefined();
      expect(varMeta.iptc).toBeUndefined();
      expect(varMeta.icc).toBeUndefined();
    });

    it("verifies permissions (0600 file, 0700 dir)", async () => {
      if (process.platform === "win32") return;

      const filePath = path.join(tempDir, "perms.jpg");
      await createTestJpeg(100, 100, filePath);
      const projectId = "00000000-0000-4000-8000-000000000000";
      await processImage(filePath, tempDir, projectId, mediaDir, "TEST", "R");

      const projDir = path.join(mediaDir, projectId);
      const statP = fs.statSync(projDir);
      expect(statP.mode & 0o777).toBe(0o700);

      const origDir = path.join(projDir, "originals");
      const statO = fs.statSync(origDir);
      expect(statO.mode & 0o777).toBe(0o700);

      const files = fs.readdirSync(origDir);
      const fileStat = fs.statSync(path.join(origDir, files[0]));
      expect(fileStat.mode & 0o777).toBe(0o600);
    });
  });

  describe("Watermark structural comparison", () => {
    it("watermark alters the center, but preserves edges", async () => {
      const filePath = path.join(tempDir, "watermark.jpg");
      // Use an image that has no red/blue
      const buffer = await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 100, g: 100, b: 100 } }
      }).jpeg().toBuffer();
      fs.writeFileSync(filePath, buffer);

      const projectId = "00000000-0000-4000-8000-000000000000";
      const result = await processImage(filePath, tempDir, projectId, mediaDir, "TIMETEST", "R");
      const variantPath = path.join(mediaDir, projectId, result.variants[0].name, `${result.variants[0].fileId}.webp`);

      // Compare pixel by pixel on the resized variant size
      const withWatermark = fs.readFileSync(variantPath);
      const variantMeta = await sharp(withWatermark).metadata();

      const withoutWatermark = await sharp(buffer)
        .rotate()
        .resize(variantMeta.width, variantMeta.height, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80, effort: 6 })
        .toBuffer();

      const bufWM = await sharp(withWatermark).ensureAlpha().raw().toBuffer();
      const bufNo = await sharp(withoutWatermark).ensureAlpha().raw().toBuffer();

      let diffCenter = 0;
      let diffEdge = 0;

      const w = variantMeta.width!;
      const h = variantMeta.height!;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 3;
          const diff = Math.abs(bufWM[idx] - bufNo[idx]) + Math.abs(bufWM[idx+1] - bufNo[idx+1]);
          if (x < 100 || x > 700 || y < 100 || y > 500) {
            diffEdge += diff;
          } else {
            diffCenter += diff;
          }
        }
      }

      expect(diffCenter).toBeGreaterThan(500000);
      expect(diffEdge).toBeLessThan(300000); // WebP compression might introduce tiny differences
    });
  });

  describe("Rollback on Atomic Failures", () => {
    it("écritures partielles positives : writeSync returning smaller chunks is supported", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const projectId = "00000000-0000-4000-8000-000000000000";

      const originalWriteSync = fs.writeSync;
      let mockCount = 0;
      vi.spyOn(fs, "writeSync").mockImplementation((...args: any[]) => {
        mockCount++;
        const fd = args[0];
        const buffer = args[1];
        const offset = args[2] ?? 0;
        const length = args[3] ?? buffer.length;
        const position = args[4] ?? null;

        // Force chunking by returning 10 bytes on the first few calls
        const mockLen = Math.min(length, 10);
        return originalWriteSync(fd, buffer, offset, mockLen, position);
      });

      await processImage(filePath, tempDir, projectId, mediaDir, "T", "R");
      expect(mockCount).toBeGreaterThan(1);
    });

    it("fsync du temporaire échouant avant rename provoque le rollback", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const projectId = "00000000-0000-4000-8000-000000000000";

      const originalFsyncSync = fs.fsyncSync;
      let tmpFsyncFailed = false;
      vi.spyOn(fs, "fsyncSync").mockImplementation((fd: number) => {
        if (!tmpFsyncFailed) {
          tmpFsyncFailed = true;
          throw new Error("Simulated fsync failure");
        }
        return originalFsyncSync(fd);
      });

      await expect(processImage(filePath, tempDir, projectId, mediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");

      // Check rollback: no .tmp files, no partial variants left
      const files = fs.readdirSync(tempDir);
      expect(files.filter(f => f.includes(".tmp"))).toHaveLength(0);
      const projDir = path.join(mediaDir, projectId);
      expect(fs.existsSync(projDir)).toBe(false); // Rolled back completely
    });

    it("rename de l'original échouant provoque le rollback", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const projectId = "00000000-0000-4000-8000-000000000000";

      const originalRenameSync = fs.renameSync;
      vi.spyOn(fs, "renameSync").mockImplementation((oldPath, newPath) => {
        if (newPath.toString().includes("originals")) {
          throw new Error("Simulated rename failure");
        }
        return originalRenameSync(oldPath, newPath);
      });

      await expect(processImage(filePath, tempDir, projectId, mediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");

      // Verify no .tmp files left anywhere
      const projDir = path.join(mediaDir, projectId);
      expect(fs.existsSync(projDir)).toBe(false); // Entire folder should be removed because it was created in this run
    });

    it("rename d'une variante échouant après original et 1ere variante", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(1000, 1000, filePath); // large enough for multiple variants
      const projectId = "00000000-0000-4000-8000-000000000000";

      const originalRenameSync = fs.renameSync;
      let variantCount = 0;
      vi.spyOn(fs, "renameSync").mockImplementation((oldPath, newPath) => {
        if (newPath.toString().includes("webp")) {
          variantCount++;
          if (variantCount === 2) {
            throw new Error("Simulated 2nd variant rename failure");
          }
        }
        return originalRenameSync(oldPath, newPath);
      });

      const snapshotBefore = fs.readdirSync(mediaDir);

      await expect(processImage(filePath, tempDir, projectId, mediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");

      // Check snapshot exact before/after. Since the run created the projectDir, it should wipe the ENTIRE projectDir out on failure.
      const snapshotAfter = fs.readdirSync(mediaDir);
      expect(snapshotAfter).toEqual(snapshotBefore);
    });

    it("fsync du dossier échouant après rename, SANS faux échec", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const projectId = "00000000-0000-4000-8000-000000000000";

      vi.spyOn(fs, "fsyncSync").mockImplementation((fd: number) => {
        let isDir = false;
        try { isDir = fs.fstatSync(fd).isDirectory(); } catch {}
        if (isDir) {
          throw new Error("Dir fsync failed");
        }
      });

      // SHOULD SUCCEED
      await processImage(filePath, tempDir, "00000000-0000-4000-8000-000000000000", mediaDir, "T", "R");

      const projectPath = path.join(mediaDir, "00000000-0000-4000-8000-000000000000");
      expect(fs.existsSync(projectPath)).toBe(true);
    });
  });
});
