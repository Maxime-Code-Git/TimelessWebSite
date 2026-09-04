import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import sharp from "sharp";

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

  async function createTestJpeg(width: number, height: number, filePath: string, metadata: Record<string, unknown> = {}): Promise<void> {
    let pipeline = sharp({
      create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } }
    });
    if (Object.keys(metadata).length > 0) {
      pipeline = pipeline.withMetadata(metadata as Parameters<typeof pipeline.withMetadata>[0]);
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

  async function createTestWebp(width: number, height: number, filePath: string): Promise<void> {
    const buffer = await sharp({
      create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } }
    }).webp().toBuffer();
    fs.writeFileSync(filePath, buffer);
  }

  const PROJECT_ID = "00000000-0000-4000-8000-000000000000";
  const WM_REV = "aabb0000ccdd1111eeff2222aabb3333";

  describe("Image Validation", () => {
    it("should accept a valid JPEG", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(800, 600, filePath);

      const result = await validateImageFile(filePath, tempDir);
      expect(result.format).toBe("jpeg");
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
    });

    it("should accept a valid PNG", async () => {
      const filePath = path.join(tempDir, "test.png");
      await createTestPng(400, 300, filePath);

      const result = await validateImageFile(filePath, tempDir);
      expect(result.format).toBe("png");
      expect(result.width).toBe(400);
      expect(result.height).toBe(300);
    });

    it("should accept a valid WebP", async () => {
      const filePath = path.join(tempDir, "test.webp");
      await createTestWebp(640, 480, filePath);

      const result = await validateImageFile(filePath, tempDir);
      expect(result.format).toBe("webp");
      expect(result.width).toBe(640);
      expect(result.height).toBe(480);
    });

    it("should reject a file with fake extension based on magic bytes", async () => {
      const filePath = path.join(tempDir, "fake.jpg");
      fs.writeFileSync(filePath, "This is not an image at all, just plain text content");

      await expect(validateImageFile(filePath, tempDir))
        .rejects.toThrow("Unsupported image format.");
    });

    it("should reject a non-image file", async () => {
      const filePath = path.join(tempDir, "document.pdf");
      fs.writeFileSync(filePath, Buffer.from("%PDF-1.4 fake content here"));

      await expect(validateImageFile(filePath, tempDir))
        .rejects.toThrow("Unsupported image format.");
    });

    it("should reject an SVG file", async () => {
      const filePath = path.join(tempDir, "image.svg");
      fs.writeFileSync(filePath, '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>');

      await expect(validateImageFile(filePath, tempDir))
        .rejects.toThrow("Unsupported image format.");
    });

    it("should reject a file exceeding 50 MiB without loading it entirely", async () => {
      const filePath = path.join(tempDir, "large.jpg");
      const fd = fs.openSync(filePath, "w");
      const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      fs.writeSync(fd, jpegHeader, 0, jpegHeader.length, 0);
      fs.ftruncateSync(fd, 51 * 1024 * 1024);
      fs.closeSync(fd);

      await expect(validateImageFile(filePath, tempDir))
        .rejects.toThrow("Image file exceeds the maximum allowed size.");
    });

    it("should reject animated/multi-page images", async () => {
      const frame1 = await sharp({
        create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } }
      }).webp().toBuffer();

      const filePath = path.join(tempDir, "animated.webp");
      fs.writeFileSync(filePath, frame1);

      const mockSharp = vi.spyOn(sharp.prototype, "metadata");
      const originalMetadata = sharp.prototype.metadata;

      mockSharp.mockImplementationOnce(async function (this: import("sharp").Sharp) {
        const meta = await originalMetadata.call(this);
        return { ...meta, pages: 5 };
      });

      await expect(validateImageFile(filePath, tempDir))
        .rejects.toThrow("Animated or multi-page images are not supported.");

      mockSharp.mockRestore();
    });

    it("should accept images at exactly the maximum allowed pixels (80,000,000)", async () => {
      const filePath = path.join(tempDir, "maxpixels.jpg");
      await createTestJpeg(100, 100, filePath);

      const mockSharp = vi.spyOn(sharp.prototype, "metadata");
      const originalMetadata = sharp.prototype.metadata;

      mockSharp.mockImplementationOnce(async function (this: import("sharp").Sharp) {
        const meta = await originalMetadata.call(this);
        return { ...meta, width: 10000, height: 8000 };
      });

      const result = await validateImageFile(filePath, tempDir);
      expect(result.width).toBe(10000);
      expect(result.height).toBe(8000);

      mockSharp.mockRestore();
    });

    it("should reject images exceeding the pixel limit by exactly 1 pixel (80,000,001)", async () => {
      const filePath = path.join(tempDir, "toomanypixels.jpg");
      await createTestJpeg(100, 100, filePath);

      const mockSharp = vi.spyOn(sharp.prototype, "metadata");
      const originalMetadata = sharp.prototype.metadata;

      mockSharp.mockImplementationOnce(async function (this: import("sharp").Sharp) {
        const meta = await originalMetadata.call(this);
        return { ...meta, width: 80000001, height: 1 };
      });

      await expect(validateImageFile(filePath, tempDir))
        .rejects.toThrow("Image resolution exceeds the maximum allowed pixels.");

      mockSharp.mockRestore();
    });

    it("should reject width > 12000", async () => {
      const filePath = path.join(tempDir, "width.jpg");
      await createTestJpeg(100, 100, filePath);

      const mockSharp = vi.spyOn(sharp.prototype, "metadata");
      const originalMetadata = sharp.prototype.metadata;

      mockSharp.mockImplementationOnce(async function (this: import("sharp").Sharp) {
        const meta = await originalMetadata.call(this);
        return { ...meta, width: 12001, height: 1000 };
      });

      await expect(validateImageFile(filePath, tempDir))
        .rejects.toThrow("Image dimensions exceed the maximum allowed size.");

      mockSharp.mockRestore();
    });

    it("should reject height > 12000", async () => {
      const filePath = path.join(tempDir, "height.jpg");
      await createTestJpeg(100, 100, filePath);

      const mockSharp = vi.spyOn(sharp.prototype, "metadata");
      const originalMetadata = sharp.prototype.metadata;

      mockSharp.mockImplementationOnce(async function (this: import("sharp").Sharp) {
        const meta = await originalMetadata.call(this);
        return { ...meta, width: 1000, height: 12001 };
      });

      await expect(validateImageFile(filePath, tempDir))
        .rejects.toThrow("Image dimensions exceed the maximum allowed size.");

      mockSharp.mockRestore();
    });

    it("should reject a file outside the allowed directory", async () => {
      const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-other-"));
      const filePath = path.join(otherDir, "escape.jpg");
      await createTestJpeg(100, 100, filePath);

      try {
        await expect(validateImageFile(filePath, tempDir))
          .rejects.toThrow("Image validation failed.");
      } finally {
        fs.rmSync(otherDir, { recursive: true, force: true });
      }
    });

    it("should reject a symlink pointing outside allowed directory", async () => {
      const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-sym-target-"));
      const targetFile = path.join(otherDir, "real.jpg");
      await createTestJpeg(100, 100, targetFile);

      const symlinkPath = path.join(tempDir, "symlink.jpg");
      fs.symlinkSync(targetFile, symlinkPath);

      try {
        await expect(validateImageFile(symlinkPath, tempDir))
          .rejects.toThrow("Image validation failed.");
      } finally {
        fs.rmSync(otherDir, { recursive: true, force: true });
      }
    });
  });

  // === Processing Tests ===

  describe("Image Processing", () => {
    it("should auto-orient images with real EXIF orientation 6", async () => {
      const filePath = path.join(tempDir, "oriented.jpg");
      // Create 800x600 image with EXIF orientation 6 (90° CW rotation)
      const buffer = await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 100, b: 50 } }
      }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
      fs.writeFileSync(filePath, buffer);

      // Verify source has orientation 6
      const srcMeta = await sharp(filePath).metadata();
      expect(srcMeta.orientation).toBe(6);
      expect(srcMeta.width).toBe(800);
      expect(srcMeta.height).toBe(600);

      const result = await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "Timeless", WM_REV);

      // Logical dimensions should be swapped: 600x800
      expect(result.originalWidth).toBe(600);
      expect(result.originalHeight).toBe(800);

      // Original file should be byte-identical to source (SHA-256)
      const srcHash = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
      const origPath = path.join(mediaDir, PROJECT_ID, "originals", `${result.fileId}.jpeg`);
      const origHash = crypto.createHash("sha256").update(fs.readFileSync(origPath)).digest("hex");
      expect(origHash).toBe(srcHash);

      // First variant should be physically rotated and without EXIF orientation
      const variant = result.variants[0];
      // 600x800, scale=min(480/600, 480/800)=min(0.8,0.6)=0.6 -> 360x480
      expect(variant.width).toBe(360);
      expect(variant.height).toBe(480);
      const variantPath = path.join(mediaDir, PROJECT_ID, variant.name, `${variant.fileId}.webp`);
      const variantMeta = await sharp(variantPath).metadata();
      expect(variantMeta.orientation).toBeUndefined();
    });

    it("should not produce enlarged variants", async () => {
      const filePath = path.join(tempDir, "small.jpg");
      await createTestJpeg(300, 200, filePath);

      const result = await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "Timeless", WM_REV);

      // Only 480p should be produced (at natural size since 300 < 480)
      expect(result.variants).toHaveLength(1);
      expect(result.variants[0].name).toBe("480p");
      expect(result.variants[0].width).toBeLessThanOrEqual(300);
      expect(result.variants[0].height).toBeLessThanOrEqual(200);
    });

    it("should produce correct variants for large images with exact dimensions", async () => {
      const filePath = path.join(tempDir, "large.jpg");
      await createTestJpeg(3000, 2000, filePath);

      const result = await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "Timeless", WM_REV);

      expect(result.variants.length).toBe(4);
      const byName = new Map(result.variants.map(v => [v.name, v]));

      // 3000x2000: scale = min(bp/3000, bp/2000)
      // 480p: scale=min(0.16, 0.24)=0.16 -> round(3000*0.16)=480, round(2000*0.16)=320
      expect(byName.get("480p")!.width).toBe(480);
      expect(byName.get("480p")!.height).toBe(320);

      // 960p: scale=min(0.32, 0.48)=0.32 -> 960x640
      expect(byName.get("960p")!.width).toBe(960);
      expect(byName.get("960p")!.height).toBe(640);

      // 1440p: scale=min(0.48, 0.72)=0.48 -> 1440x960
      expect(byName.get("1440p")!.width).toBe(1440);
      expect(byName.get("1440p")!.height).toBe(960);

      // 1920p: scale=min(0.64, 0.96)=0.64 -> 1920x1280
      expect(byName.get("1920p")!.width).toBe(1920);
      expect(byName.get("1920p")!.height).toBe(1280);
    });

    it("should produce WebP variants", async () => {
      const filePath = path.join(tempDir, "webptest.jpg");
      await createTestJpeg(1000, 800, filePath);

      const result = await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "Timeless", WM_REV);

      for (const variant of result.variants) {
        const variantPath = path.join(mediaDir, PROJECT_ID, variant.name, `${variant.fileId}.webp`);
        expect(fs.existsSync(variantPath)).toBe(true);
        const meta = await sharp(variantPath).metadata();
        expect(meta.format).toBe("webp");
      }
    });

    it("should strip EXIF Copyright from variants", async () => {
      const filePath = path.join(tempDir, "exif.jpg");
      const buffer = await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 128, g: 128, b: 128 } }
      }).withMetadata({ exif: { IFD0: { Copyright: "Test" } } }).jpeg().toBuffer();
      fs.writeFileSync(filePath, buffer);

      const result = await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "Timeless", WM_REV);

      for (const variant of result.variants) {
        const variantPath = path.join(mediaDir, PROJECT_ID, variant.name, `${variant.fileId}.webp`);
        const meta = await sharp(variantPath).metadata();
        expect(meta.exif).toBeUndefined();
      }
    });

    it("should set file permissions to 0600 on original and all variants", async () => {
      if (process.platform === "win32") return;

      const filePath = path.join(tempDir, "perms.jpg");
      await createTestJpeg(2000, 1500, filePath);

      const result = await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "Timeless", WM_REV);

      // Check original file
      const origPath = path.join(mediaDir, PROJECT_ID, "originals", `${result.fileId}.${result.originalFormat}`);
      expect(fs.statSync(origPath).mode & 0o777).toBe(0o600);

      // Check all variant files
      for (const variant of result.variants) {
        const variantPath = path.join(mediaDir, PROJECT_ID, variant.name, `${variant.fileId}.webp`);
        expect(fs.statSync(variantPath).mode & 0o777).toBe(0o600);
      }
    });

    it("should set directory permissions to 0700 on projectDir, originalsDir and variantDirs", async () => {
      if (process.platform === "win32") return;

      const filePath = path.join(tempDir, "dirperms.jpg");
      await createTestJpeg(2000, 1500, filePath);

      const result = await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "Timeless", WM_REV);

      const projectDir = path.join(mediaDir, PROJECT_ID);
      expect(fs.statSync(projectDir).mode & 0o777).toBe(0o700);

      const originalsDir = path.join(projectDir, "originals");
      expect(fs.statSync(originalsDir).mode & 0o777).toBe(0o700);

      for (const variant of result.variants) {
        const variantDir = path.join(projectDir, variant.name);
        expect(fs.statSync(variantDir).mode & 0o777).toBe(0o700);
      }
    });

    it("should produce different files for different watermark texts", async () => {
      const filePath1 = path.join(tempDir, "wm1.jpg");
      const filePath2 = path.join(tempDir, "wm2.jpg");
      await createTestJpeg(800, 600, filePath1);
      await createTestJpeg(800, 600, filePath2);

      const mediaDir1 = path.join(tempDir, "media1");
      const mediaDir2 = path.join(tempDir, "media2");
      fs.mkdirSync(mediaDir1);
      fs.mkdirSync(mediaDir2);

      const pId1 = "00000000-0000-4000-8000-000000000001";
      const pId2 = "00000000-0000-4000-8000-000000000002";

      const result1 = await processImage(filePath1, tempDir, pId1, mediaDir1, "Timeless", WM_REV);
      const result2 = await processImage(filePath2, tempDir, pId2, mediaDir2, "Different Mark", WM_REV);

      const variant1Path = path.join(mediaDir1, pId1, result1.variants[0].name, `${result1.variants[0].fileId}.webp`);
      const variant2Path = path.join(mediaDir2, pId2, result2.variants[0].name, `${result2.variants[0].fileId}.webp`);

      const buf1 = fs.readFileSync(variant1Path);
      const buf2 = fs.readFileSync(variant2Path);
      expect(buf1.equals(buf2)).toBe(false);
    });

    it("should modify the center of the image with the watermark (reference comparison)", async () => {
      const filePath = path.join(tempDir, "center.jpg");
      // Create a uniform red image
      const srcBuffer = await sharp({
        create: { width: 400, height: 300, channels: 3, background: { r: 255, g: 0, b: 0 } }
      }).jpeg({ quality: 100 }).toBuffer();
      fs.writeFileSync(filePath, srcBuffer);

      const result = await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "WATERMARK", WM_REV);

      const variant = result.variants[0];
      const variantPath = path.join(mediaDir, PROJECT_ID, variant.name, `${variant.fileId}.webp`);
      const variantBuffer = fs.readFileSync(variantPath);

      // Build reference: same resize + WebP, NO watermark
      const refBuffer = await sharp(filePath)
        .rotate()
        .resize(variant.width, variant.height, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      // Compare via resolveWithObject for pixel data + channel info
      const { data: wmData, info: wmInfo } = await sharp(variantBuffer)
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { data: refData, info: refInfo } = await sharp(refBuffer)
        .raw()
        .toBuffer({ resolveWithObject: true });

      expect(wmInfo.width).toBe(refInfo.width);
      expect(wmInfo.height).toBe(refInfo.height);

      const channels = wmInfo.channels;
      const w = wmInfo.width;
      const h = wmInfo.height;

      // Center region: 25% to 75%
      const cx = Math.floor(w / 2);
      const cy = Math.floor(h / 2);
      const centerRadius = Math.min(Math.floor(w * 0.25), Math.floor(h * 0.25));

      let centerDiffSum = 0;
      let centerPixelCount = 0;
      for (let y = cy - centerRadius; y < cy + centerRadius; y++) {
        for (let x = cx - centerRadius; x < cx + centerRadius; x++) {
          const offset = (y * w + x) * channels;
          for (let c = 0; c < Math.min(channels, 3); c++) {
            centerDiffSum += Math.abs(wmData[offset + c] - refData[offset + c]);
          }
          centerPixelCount++;
        }
      }
      const avgCenterDiff = centerDiffSum / (centerPixelCount * Math.min(channels, 3));
      // Watermark should cause significant difference at center
      expect(avgCenterDiff).toBeGreaterThan(1);

      // Edge region: first and last 5 rows
      const edgeRows = 5;
      let edgeDiffSum = 0;
      let edgePixelCount = 0;
      for (const yRange of [[0, edgeRows], [h - edgeRows, h]]) {
        for (let y = yRange[0]; y < yRange[1]; y++) {
          for (let x = 0; x < w; x++) {
            const offset = (y * w + x) * channels;
            for (let c = 0; c < Math.min(channels, 3); c++) {
              edgeDiffSum += Math.abs(wmData[offset + c] - refData[offset + c]);
            }
            edgePixelCount++;
          }
        }
      }
      const avgEdgeDiff = edgeDiffSum / (edgePixelCount * Math.min(channels, 3));
      // Edges should be within tolerance (watermark mostly affects center)
      expect(avgEdgeDiff).toBeLessThan(avgCenterDiff);
    });

    it("should return appliedWatermarkRevision in result", async () => {
      const filePath = path.join(tempDir, "rev.jpg");
      await createTestJpeg(800, 600, filePath);

      const result = await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "Timeless", WM_REV);

      expect(result.appliedWatermarkRevision).toBe(WM_REV);
    });

    it("should return original format and dimensions in result", async () => {
      const filePath = path.join(tempDir, "meta.png");
      await createTestPng(1200, 900, filePath);

      const result = await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "Timeless", WM_REV);

      expect(result.originalFormat).toBe("png");
      expect(result.originalWidth).toBe(1200);
      expect(result.originalHeight).toBe(900);
    });

    it("should not expose paths in result metadata", async () => {
      const filePath = path.join(tempDir, "nopath.jpg");
      await createTestJpeg(800, 600, filePath);

      const result = await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "Timeless", WM_REV);

      const resultJson = JSON.stringify(result);
      expect(resultJson).not.toContain(tempDir);
      expect(resultJson).not.toContain(mediaDir);
      expect(resultJson).not.toContain("/Users/");
      expect(resultJson).not.toContain("/tmp/");
    });
  });

  // === Resize and Watermark Correctness ===

  describe("Resize and Watermark Correctness", () => {
    it("should process a 501x619 image correctly without dimension mismatch (Regression)", async () => {
      const filePath = path.join(tempDir, "regression.jpg");
      await createTestJpeg(501, 619, filePath);

      const result = await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "Timeless", WM_REV);

      expect(result.originalWidth).toBe(501);
      expect(result.originalHeight).toBe(619);

      const variant480p = result.variants.find(v => v.name === "480p");
      expect(variant480p).toBeDefined();

      // For fit: 'inside', the largest dimension should be exactly 480
      // 501 / 619 = ~0.809, so 480 * 0.809 = ~388.
      expect(variant480p!.height).toBe(480);
      expect(variant480p!.width).toBe(388);

      // Verify original hasn't been changed
      const originalPath = path.join(mediaDir, PROJECT_ID, "originals", `${result.fileId}.jpeg`);
      const originalHash = crypto.createHash("sha256").update(fs.readFileSync(originalPath)).digest("hex");
      const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
      expect(originalHash).toBe(sourceHash);

      // Verify no temporary files remain
      const allFiles = getAllFilesRecursive(tempDir);
      expect(allFiles.filter(f => f.includes(".tmp."))).toHaveLength(0);

      // Verify the dimensions in the generated webp actually match what's reported
      const variantPath = path.join(mediaDir, PROJECT_ID, "480p", variant480p!.fileId + ".webp");
      const variantMeta = await sharp(variantPath).metadata();
      expect(variantMeta.width).toBe(388);
      expect(variantMeta.height).toBe(480);
      expect(variantMeta.format).toBe("webp");
    });

    it("should process an image with EXIF orientation 6 correctly", async () => {
      const filePath = path.join(tempDir, "exif6.jpg");
      // Image is physically 800x400 (landscape), but EXIF says orientation 6 (rotate 90 CW)
      // So logically it is 400x800 (portrait).
      await createTestJpeg(800, 400, filePath, { orientation: 6 });

      const result = await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "Timeless", WM_REV);

      // processImage swaps width/height during validation for orientation >= 5
      expect(result.originalWidth).toBe(400);
      expect(result.originalHeight).toBe(800);

      const variant480p = result.variants.find(v => v.name === "480p");
      expect(variant480p).toBeDefined();

      // Since logically it is 400x800, height determines scale.
      // scale = 480 / 800 = 0.6. width = 400 * 0.6 = 240.
      expect(variant480p!.width).toBe(240);
      expect(variant480p!.height).toBe(480);

      const variantPath = path.join(mediaDir, PROJECT_ID, "480p", variant480p!.fileId + ".webp");
      const variantMeta = await sharp(variantPath).metadata();
      expect(variantMeta.width).toBe(240);
      expect(variantMeta.height).toBe(480);
      expect(variantMeta.format).toBe("webp");
    });
  });

  // === Watermark Rendering and CWD ===

  describe("Watermark rendering from different CWD", () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const appsWeb = path.resolve(__dirname, "..");
    const cwdCases = [
      { label: "repo root", dir: repoRoot },
      { label: "apps/web", dir: appsWeb },
      { label: "os.tmpdir()", dir: "" }, // will be set dynamically
    ];

    for (const cwdCase of cwdCases) {
      it(`should render valid SVG from ${cwdCase.label}`, async () => {
        const originalCwd = process.cwd();
        const targetDir = cwdCase.dir || fs.mkdtempSync(path.join(os.tmpdir(), "cwd-test-"));
        try {
          _resetFontCache();
          process.chdir(targetDir);
          const svg = await renderTextWatermark({
            text: "TestWatermark",
            watermarkRevision: WM_REV,
            width: 800,
            height: 600,
          });
          expect(Buffer.isBuffer(svg)).toBe(true);
          expect(svg.length).toBeGreaterThan(0);
          const svgStr = svg.toString("utf8");
          expect(svgStr).toContain("<svg");
          expect(svgStr).toContain("TestWatermark");
        } finally {
          process.chdir(originalCwd);
          _resetFontCache();
          if (!cwdCase.dir) {
            fs.rmSync(targetDir, { recursive: true, force: true });
          }
        }
      });
    }
  });

  // === Directory confinement and Symlinks ===

  describe("Directory confinement and Symlinks", () => {
    async function assertSymlinkRejection(symlinkPath: string, targetPath: string, pId: string) {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);

      const sentinelPath = path.join(targetPath, "sentinel.txt");
      fs.writeFileSync(sentinelPath, "SAFE");

      await expect(processImage(filePath, tempDir, pId, mediaDir, "TEST", "rev"))
        .rejects.toThrow("Image processing failed due to an internal error.");

      expect(fs.lstatSync(symlinkPath).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(sentinelPath, "utf8")).toBe("SAFE");

      const filesInTarget = fs.readdirSync(targetPath);
      expect(filesInTarget).toHaveLength(1);
      expect(filesInTarget[0]).toBe("sentinel.txt");
    }

    it("rejects projectDir symlink (external)", async () => {
      const targetPath = path.join(tempDir, "fake_project");
      fs.mkdirSync(targetPath);
      const pId = "00000000-0000-4000-8000-000000000001";
      const symlinkPath = path.join(mediaDir, pId);
      fs.symlinkSync(targetPath, symlinkPath);
      await assertSymlinkRejection(symlinkPath, targetPath, pId);
    });

    it("rejects projectDir symlink (internal)", async () => {
      const pId = "00000000-0000-4000-8000-000000000001";
      const targetPath = path.join(mediaDir, "00000000-0000-4000-8000-000000000002");
      fs.mkdirSync(targetPath);
      const symlinkPath = path.join(mediaDir, pId);
      fs.symlinkSync(targetPath, symlinkPath);
      await assertSymlinkRejection(symlinkPath, targetPath, pId);
    });

    it("rejects originalsDir symlink (external)", async () => {
      const pId = "00000000-0000-4000-8000-000000000001";
      const projectDir = path.join(mediaDir, pId);
      fs.mkdirSync(projectDir);
      const targetPath = path.join(tempDir, "fake_originals");
      fs.mkdirSync(targetPath);
      const symlinkPath = path.join(projectDir, "originals");
      fs.symlinkSync(targetPath, symlinkPath);
      await assertSymlinkRejection(symlinkPath, targetPath, pId);
    });

    it("rejects originalsDir symlink (internal)", async () => {
      const pId = "00000000-0000-4000-8000-000000000001";
      const projectDir = path.join(mediaDir, pId);
      fs.mkdirSync(projectDir);
      const targetPath = path.join(projectDir, "other_internal");
      fs.mkdirSync(targetPath);
      const symlinkPath = path.join(projectDir, "originals");
      fs.symlinkSync(targetPath, symlinkPath);
      await assertSymlinkRejection(symlinkPath, targetPath, pId);
    });

    it("rejects variantDir symlink (external)", async () => {
      const pId = "00000000-0000-4000-8000-000000000001";
      const projectDir = path.join(mediaDir, pId);
      fs.mkdirSync(projectDir);
      const targetPath = path.join(tempDir, "fake_480p");
      fs.mkdirSync(targetPath);
      const symlinkPath = path.join(projectDir, "480p");
      fs.symlinkSync(targetPath, symlinkPath);
      await assertSymlinkRejection(symlinkPath, targetPath, pId);
    });

    it("rejects variantDir symlink (internal)", async () => {
      const pId = "00000000-0000-4000-8000-000000000001";
      const projectDir = path.join(mediaDir, pId);
      fs.mkdirSync(projectDir);
      const targetPath = path.join(projectDir, "other_480p");
      fs.mkdirSync(targetPath);
      const symlinkPath = path.join(projectDir, "480p");
      fs.symlinkSync(targetPath, symlinkPath);
      await assertSymlinkRejection(symlinkPath, targetPath, pId);
    });

    it("rejects mediaBasePath symlink (external)", async () => {
      const fakeMediaDir = path.join(tempDir, "fake_media");
      fs.mkdirSync(fakeMediaDir);
      const symlinkMediaDir = path.join(tempDir, "symlink_media");
      fs.symlinkSync(fakeMediaDir, symlinkMediaDir);

      const sentinelPath = path.join(fakeMediaDir, "sentinel.txt");
      fs.writeFileSync(sentinelPath, "SAFE");

      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      await expect(processImage(filePath, tempDir, "00000000-0000-4000-8000-000000000001", symlinkMediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");

      expect(fs.readFileSync(sentinelPath, "utf8")).toBe("SAFE");
      expect(fs.readdirSync(fakeMediaDir)).toEqual(["sentinel.txt"]);
    });

    it("rejects mediaBasePath symlink (internal) with sentinel", async () => {
      // mediaBasePath is a symlink pointing to another directory inside tempDir
      const realMedia = path.join(tempDir, "real_media");
      fs.mkdirSync(realMedia);
      const symlinkMedia = path.join(tempDir, "link_media");
      fs.symlinkSync(realMedia, symlinkMedia);

      const sentinelPath = path.join(realMedia, "sentinel.txt");
      fs.writeFileSync(sentinelPath, "UNTOUCHED");

      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      await expect(processImage(filePath, tempDir, "00000000-0000-4000-8000-000000000001", symlinkMedia, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");

      expect(fs.readFileSync(sentinelPath, "utf8")).toBe("UNTOUCHED");
      expect(fs.readdirSync(realMedia)).toEqual(["sentinel.txt"]);
    });

    it("creates mediaBasePath if it does not exist", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const res = await processImage(filePath, tempDir, PROJECT_ID, path.join(tempDir, "nope"), "T", "R");
      expect(res.fileId).toBeTruthy();
      expect(fs.existsSync(path.join(tempDir, "nope"))).toBe(true);
    });

    it("rejects if mediaBasePath is a file", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const notDir = path.join(tempDir, "notadir");
      fs.writeFileSync(notDir, "file");
      await expect(processImage(filePath, tempDir, PROJECT_ID, notDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");
    });

    it("rejects lstatSync EACCES on mediaBasePath", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const originalLstatSync = fs.lstatSync;
      vi.spyOn(fs, "lstatSync").mockImplementation((pathArg: fs.PathLike) => {
        if (pathArg.toString() === mediaDir) {
          const err = new Error("EACCES");
          (err as NodeJS.ErrnoException).code = "EACCES";
          throw err;
        }
        return originalLstatSync(pathArg);
      });
      await expect(processImage(filePath, tempDir, PROJECT_ID, mediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");
    });

    it("rejects realpathSync EACCES on mediaBasePath", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const originalRealpathSync = fs.realpathSync;
      vi.spyOn(fs, "realpathSync").mockImplementation((pathArg: fs.PathLike) => {
        if (pathArg.toString() === mediaDir) {
          const err = new Error("EACCES");
          (err as NodeJS.ErrnoException).code = "EACCES";
          throw err;
        }
        return originalRealpathSync(pathArg);
      });
      await expect(processImage(filePath, tempDir, PROJECT_ID, mediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");
    });

    it("rejects invalid UUIDs", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      await expect(processImage(filePath, tempDir, "invalid-uuid", mediaDir, "T", "R")).rejects.toThrow("Invalid project ID.");
      await expect(processImage(filePath, tempDir, "../00000000-0000-4000-8000-000000000000", mediaDir, "T", "R")).rejects.toThrow("Invalid project ID.");
    });

    it("masks ENOENT to generic error without path", async () => {
      const filePath = path.join(tempDir, "missing.jpg");
      try {
        await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "T", "R");
        expect.fail();
      } catch (err) {
        const error = err as Error;
        expect(error.message).toBe("Image processing failed due to an internal error.");
        expect(error.message).not.toContain("missing.jpg");
        expect(error.cause).toBeUndefined();
      }
    });

    it("rejects absent allowedTempDir securely", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const fakeTemp = path.join(tempDir, "nope");
      try {
        await processImage(filePath, fakeTemp, PROJECT_ID, mediaDir, "T", "R");
        expect.fail();
      } catch (err) {
        const error = err as Error;
        expect(error.message).toBe("Image validation failed.");
        expect(error.message).not.toContain("nope");
        expect(error.cause).toBeUndefined();
      }
    });

    it("masks statSync EACCES", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const originalStatSync = fs.statSync;
      vi.spyOn(fs, "statSync").mockImplementation((pathArg: fs.PathLike, options?: fs.StatOptions) => {
        if (pathArg.toString() === filePath) {
          const err = new Error("EACCES");
          (err as NodeJS.ErrnoException).code = "EACCES";
          throw err;
        }
        return originalStatSync(pathArg, options);
      });
      try {
        await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "T", "R");
        expect.fail();
      } catch (err) {
        const error = err as Error;
        expect(error.message).toBe("Image processing failed due to an internal error.");
        expect(error.message).not.toContain("test.jpg");
        expect(error.cause).toBeUndefined();
      }
    });

    it("masks openSync EACCES", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const originalOpenSync = fs.openSync;
      vi.spyOn(fs, "openSync").mockImplementation((pathArg: fs.PathLike, flags: string | number, mode?: string | number | null) => {
        if (pathArg.toString() === filePath) {
          const err = new Error("EACCES");
          (err as NodeJS.ErrnoException).code = "EACCES";
          throw err;
        }
        return originalOpenSync(pathArg, flags, mode);
      });
      try {
        await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "T", "R");
        expect.fail();
      } catch (err) {
        const error = err as Error;
        expect(error.message).toBe("Image processing failed due to an internal error.");
        expect(error.message).not.toContain("test.jpg");
        expect(error.cause).toBeUndefined();
      }
    });

    it("masks readSync error", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      vi.spyOn(fs, "readSync").mockImplementation(() => {
        throw new Error("ReadError");
      });
      try {
        await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "T", "R");
        expect.fail();
      } catch (err) {
        const error = err as Error;
        expect(error.message).toBe("Image processing failed due to an internal error.");
        expect(error.cause).toBeUndefined();
      }
    });

    it("masks sharp metadata internal error", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      vi.spyOn(sharp.prototype, "metadata").mockRejectedValue(new Error("Sharp internal memory error"));
      try {
        await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "T", "R");
        expect.fail();
      } catch (err) {
        const error = err as Error;
        expect(error.message).toBe("Image processing failed due to an internal error.");
        expect(error.cause).toBeUndefined();
      }
    });

    it("masks error starting with 'Image' that contains a secret path", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      vi.spyOn(sharp.prototype, "metadata").mockRejectedValue(
        new Error("Image failure at /secret/private/photo.jpg")
      );
      try {
        await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "T", "R");
        expect.fail();
      } catch (err) {
        const error = err as Error;
        expect(error.message).toBe("Image processing failed due to an internal error.");
        expect(error.message).not.toContain("/secret");
        expect(error.cause).toBeUndefined();
        // No output files should have been created
        const projDir = path.join(mediaDir, PROJECT_ID);
        expect(fs.existsSync(projDir)).toBe(false);
      }
    });

    it("rejects symlink source file (internal)", async () => {
      const realFile = path.join(tempDir, "real.jpg");
      await createTestJpeg(100, 100, realFile);
      const symlinkFile = path.join(tempDir, "link.jpg");
      fs.symlinkSync(realFile, symlinkFile);

      // Both are inside tempDir, but the source is a symlink
      await expect(validateImageFile(symlinkFile, tempDir))
        .rejects.toThrow("Image validation failed.");

      // Symlink and real file must be unchanged
      expect(fs.lstatSync(symlinkFile).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(realFile)).toBe(true);
    });

    it("rejects symlink source file (external)", async () => {
      const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-ext-"));
      const realFile = path.join(otherDir, "external.jpg");
      await createTestJpeg(100, 100, realFile);
      const symlinkFile = path.join(tempDir, "link_ext.jpg");
      fs.symlinkSync(realFile, symlinkFile);

      try {
        await expect(validateImageFile(symlinkFile, tempDir))
          .rejects.toThrow("Image validation failed.");

        expect(fs.lstatSync(symlinkFile).isSymbolicLink()).toBe(true);
        expect(fs.existsSync(realFile)).toBe(true);
      } finally {
        fs.rmSync(otherDir, { recursive: true, force: true });
      }
    });
  });

  // === Rollback on Atomic Failures ===

  describe("Rollback on Atomic Failures", () => {
    it("writeSync returning 0 causes rejection with no temp or partial files", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);

      const snapshotBefore = fs.readdirSync(mediaDir);

      // Return 0 for all writeSync calls — atomicWriteFile should throw
      (vi.spyOn(fs, "writeSync") as ReturnType<typeof vi.fn>).mockReturnValue(0);

      await expect(processImage(filePath, tempDir, PROJECT_ID, mediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");

      const snapshotAfter = fs.readdirSync(mediaDir);
      expect(snapshotAfter).toEqual(snapshotBefore);

      // No .tmp files should remain
      const allFiles = getAllFilesRecursive(tempDir);
      expect(allFiles.filter(f => f.includes(".tmp."))).toHaveLength(0);
    });

    it("partial writeSync returning smaller chunks is supported", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);
      const originalWriteSync = fs.writeSync;
      let mockCount = 0;
      (vi.spyOn(fs, "writeSync") as ReturnType<typeof vi.fn>).mockImplementation(
        (fd: number, buffer: NodeJS.ArrayBufferView, offset?: number | null, length?: number | null, position?: number | null) => {
          mockCount++;
          const actualOffset = offset ?? 0;
          const actualLength = length ?? buffer.byteLength;
          const actualPosition = position ?? null;

          // Force chunking by returning 10 bytes on the first few calls
          const mockLen = Math.min(actualLength, 10);
          return originalWriteSync(fd, buffer, actualOffset, mockLen, actualPosition);
        }
      );

      await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "T", "R");
      expect(mockCount).toBeGreaterThan(1);
    });

    it("fsync du temporaire échouant avant rename provoque le rollback", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);

      const sentinelPath = path.join(mediaDir, "sentinel.txt");
      fs.writeFileSync(sentinelPath, "INTACT");

      const originalFsyncSync = fs.fsyncSync;
      let tmpFsyncFailed = false;
      vi.spyOn(fs, "fsyncSync").mockImplementation((fd: number) => {
        if (!tmpFsyncFailed) {
          // Fail only for the first file fsync (temp file)
          let isDir = false;
          try { isDir = fs.fstatSync(fd).isDirectory(); } catch { /* ignore */ }
          if (!isDir) {
            tmpFsyncFailed = true;
            throw new Error("Simulated fsync failure");
          }
        }
        return originalFsyncSync(fd);
      });

      await expect(processImage(filePath, tempDir, PROJECT_ID, mediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");

      // Sentinel untouched
      expect(fs.readFileSync(sentinelPath, "utf8")).toBe("INTACT");

      // No .tmp files
      const allFiles = getAllFilesRecursive(mediaDir);
      expect(allFiles.filter(f => f.includes(".tmp."))).toHaveLength(0);
    });

    it("rename de l'original échouant provoque le rollback", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);

      const sentinelPath = path.join(mediaDir, "sentinel.txt");
      fs.writeFileSync(sentinelPath, "INTACT");

      const originalRenameSync = fs.renameSync;
      vi.spyOn(fs, "renameSync").mockImplementation((oldPath, newPath) => {
        if (newPath.toString().includes("originals")) {
          throw new Error("Simulated rename failure");
        }
        return originalRenameSync(oldPath, newPath);
      });

      await expect(processImage(filePath, tempDir, PROJECT_ID, mediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");

      expect(fs.readFileSync(sentinelPath, "utf8")).toBe("INTACT");

      // Project dir should be rolled back
      const projDir = path.join(mediaDir, PROJECT_ID);
      expect(fs.existsSync(projDir)).toBe(false);
    });

    it("rename d'une variante échouant après original et 1ere variante", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(1000, 1000, filePath); // large enough for multiple variants

      const sentinelPath = path.join(mediaDir, "sentinel.txt");
      fs.writeFileSync(sentinelPath, "INTACT");
      const snapshotBefore = fs.readdirSync(mediaDir).sort();

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

      await expect(processImage(filePath, tempDir, PROJECT_ID, mediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");

      // Snapshot must match before/after
      const snapshotAfter = fs.readdirSync(mediaDir).sort();
      expect(snapshotAfter).toEqual(snapshotBefore);
      expect(fs.readFileSync(sentinelPath, "utf8")).toBe("INTACT");
    });

    it("openSync failing on atomic write in originals causes rollback", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);

      const sentinelPath = path.join(mediaDir, "sentinel.txt");
      fs.writeFileSync(sentinelPath, "INTACT");
      const snapshotBefore = fs.readdirSync(mediaDir).sort();

      const originalOpenSync = fs.openSync;
      vi.spyOn(fs, "openSync").mockImplementation((pathArg: fs.PathLike, flags: string | number, mode?: string | number | null) => {
        const p = pathArg.toString();
        // Fail only on atomic temp file creation in originals dir (wx flag)
        if (p.includes("originals") && p.includes(".tmp.") && flags.toString().includes("x")) {
          throw new Error("Simulated openSync failure");
        }
        return originalOpenSync(pathArg, flags, mode);
      });

      await expect(processImage(filePath, tempDir, PROJECT_ID, mediaDir, "T", "R"))
        .rejects.toThrow("Image processing failed due to an internal error.");

      const snapshotAfter = fs.readdirSync(mediaDir).sort();
      expect(snapshotAfter).toEqual(snapshotBefore);
      expect(fs.readFileSync(sentinelPath, "utf8")).toBe("INTACT");
    });

    it("fsync du dossier échouant après rename, SANS faux échec", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(100, 100, filePath);

      const originalFsyncSync = fs.fsyncSync;
      vi.spyOn(fs, "fsyncSync").mockImplementation((fd: number) => {
        let isDir = false;
        try { isDir = fs.fstatSync(fd).isDirectory(); } catch { /* ignore */ }
        if (isDir) {
          throw new Error("Dir fsync failed");
        }
        // Delegate to real fsync for file descriptors
        return originalFsyncSync(fd);
      });

      // SHOULD SUCCEED because dir fsync is best-effort
      await processImage(filePath, tempDir, PROJECT_ID, mediaDir, "T", "R");

      const projectPath = path.join(mediaDir, PROJECT_ID);
      expect(fs.existsSync(projectPath)).toBe(true);
    });
  });
});

/** Recursively list all files in a directory */
function getAllFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = fs.lstatSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...getAllFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}
