import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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
    fs.mkdirSync(mediaDir);
    _resetFontCache();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function createTestJpeg(width: number, height: number, filePath: string): Promise<void> {
    const buffer = await sharp({
      create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } }
    }).jpeg({ quality: 80 }).toBuffer();
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

  // === Validation Tests ===

  describe("Image Validation", () => {
    it("should accept a valid JPEG", async () => {
      const filePath = path.join(tempDir, "test.jpg");
      await createTestJpeg(800, 600, filePath);

      const result = await validateImageFile(filePath, tempDir);
      expect(result.format).toBe("jpg");
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
      // Write a text file with .jpg extension
      fs.writeFileSync(filePath, "This is not an image at all, just plain text content");

      await expect(validateImageFile(filePath, tempDir))
        .rejects.toThrow("Unsupported image format.");
    });

    it("should reject a non-image file", async () => {
      const filePath = path.join(tempDir, "document.pdf");
      // Write a PDF-like header
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
      // Create a sparse file (doesn't allocate actual disk space)
      const fd = fs.openSync(filePath, "w");
      // Write JPEG magic bytes at start
      const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      fs.writeSync(fd, jpegHeader, 0, jpegHeader.length, 0);
      fs.ftruncateSync(fd, 51 * 1024 * 1024);
      fs.closeSync(fd);

      await expect(validateImageFile(filePath, tempDir))
        .rejects.toThrow("Image file exceeds the maximum allowed size.");
    });

    it("should reject animated/multi-page images", async () => {
      // Create an animated WebP using Sharp
      const frame1 = await sharp({
        create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } }
      }).webp().toBuffer();

      const filePath = path.join(tempDir, "animated.webp");
      // Mock Sharp metadata for animated detection
      const mockSharp = vi.spyOn(sharp.prototype, "metadata");
      const originalMetadata = sharp.prototype.metadata;

      // Write a normal webp and override metadata
      fs.writeFileSync(filePath, frame1);

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
        // 10000 x 8000 = 80,000,000 pixels
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
    it("should auto-orient images", async () => {
      // Create a JPEG with EXIF orientation
      const filePath = path.join(tempDir, "oriented.jpg");
      const buffer = await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 100, b: 50 } }
      }).jpeg().toBuffer();
      fs.writeFileSync(filePath, buffer);

      const result = await processImage(
        filePath, tempDir, "test-project-id", mediaDir, "Timeless", "aabb0000ccdd1111eeff2222aabb3333"
      );

      expect(result.originalWidth).toBe(800);
      expect(result.originalHeight).toBe(600);
    });

    it("should not produce enlarged variants", async () => {
      const filePath = path.join(tempDir, "small.jpg");
      await createTestJpeg(300, 200, filePath);

      const result = await processImage(
        filePath, tempDir, "test-project-id", mediaDir, "Timeless", "aabb0000ccdd1111eeff2222aabb3333"
      );

      // Only 480p should be produced (at natural size since 300 < 480)
      expect(result.variants).toHaveLength(1);
      expect(result.variants[0].name).toBe("480p");
      expect(result.variants[0].width).toBeLessThanOrEqual(300);
      expect(result.variants[0].height).toBeLessThanOrEqual(200);
    });

    it("should produce correct variants for large images", async () => {
      const filePath = path.join(tempDir, "large.jpg");
      await createTestJpeg(3000, 2000, filePath);

      const result = await processImage(
        filePath, tempDir, "test-project-id", mediaDir, "Timeless", "aabb0000ccdd1111eeff2222aabb3333"
      );

      expect(result.variants.length).toBeGreaterThanOrEqual(4);
      const variantNames = result.variants.map(v => v.name);
      expect(variantNames).toContain("480p");
      expect(variantNames).toContain("960p");
      expect(variantNames).toContain("1440p");
      expect(variantNames).toContain("1920p");
    });

    it("should return exact dimensions for each variant", async () => {
      const filePath = path.join(tempDir, "exact.jpg");
      await createTestJpeg(2000, 1500, filePath);

      const result = await processImage(
        filePath, tempDir, "test-project-id", mediaDir, "Timeless", "aabb0000ccdd1111eeff2222aabb3333"
      );

      for (const variant of result.variants) {
        expect(variant.width).toBeGreaterThan(0);
        expect(variant.height).toBeGreaterThan(0);
        expect(variant.sizeBytes).toBeGreaterThan(0);
      }
    });

    it("should produce WebP variants", async () => {
      const filePath = path.join(tempDir, "webptest.jpg");
      await createTestJpeg(1000, 800, filePath);

      const result = await processImage(
        filePath, tempDir, "test-project-id", mediaDir, "Timeless", "aabb0000ccdd1111eeff2222aabb3333"
      );

      for (const variant of result.variants) {
        const variantPath = path.join(mediaDir, "test-project-id", variant.name, `${variant.fileId}.webp`);
        expect(fs.existsSync(variantPath)).toBe(true);
        const meta = await sharp(variantPath).metadata();
        expect(meta.format).toBe("webp");
      }
    });

    it("should strip EXIF/GPS from variants", async () => {
      const filePath = path.join(tempDir, "exif.jpg");
      // Create image with EXIF data
      const buffer = await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 128, g: 128, b: 128 } }
      }).withMetadata({ exif: { IFD0: { Copyright: "Test" } } }).jpeg().toBuffer();
      fs.writeFileSync(filePath, buffer);

      const result = await processImage(
        filePath, tempDir, "test-project-id", mediaDir, "Timeless", "aabb0000ccdd1111eeff2222aabb3333"
      );

      for (const variant of result.variants) {
        const variantPath = path.join(mediaDir, "test-project-id", variant.name, `${variant.fileId}.webp`);
        const meta = await sharp(variantPath).metadata();
        expect(meta.exif).toBeUndefined();
      }
    });

    it("should set file permissions to 0600 on POSIX", async () => {
      if (process.platform === "win32") return;

      const filePath = path.join(tempDir, "perms.jpg");
      await createTestJpeg(800, 600, filePath);

      const result = await processImage(
        filePath, tempDir, "test-project-id", mediaDir, "Timeless", "aabb0000ccdd1111eeff2222aabb3333"
      );

      for (const variant of result.variants) {
        const variantPath = path.join(mediaDir, "test-project-id", variant.name, `${variant.fileId}.webp`);
        const stat = fs.statSync(variantPath);
        expect(stat.mode & 0o777).toBe(0o600);
      }
    });

    it("should set directory permissions to 0700 on POSIX", async () => {
      if (process.platform === "win32") return;

      const filePath = path.join(tempDir, "dirperms.jpg");
      await createTestJpeg(800, 600, filePath);

      await processImage(
        filePath, tempDir, "test-project-id", mediaDir, "Timeless", "aabb0000ccdd1111eeff2222aabb3333"
      );

      const projectDir = path.join(mediaDir, "test-project-id");
      const stat = fs.statSync(projectDir);
      expect(stat.mode & 0o777).toBe(0o700);
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

      const result1 = await processImage(
        filePath1, tempDir, "proj1", mediaDir1, "Timeless", "aabb0000ccdd1111eeff2222aabb3333"
      );
      const result2 = await processImage(
        filePath2, tempDir, "proj2", mediaDir2, "Different Mark", "aabb0000ccdd1111eeff2222aabb3333"
      );

      const variant1Path = path.join(mediaDir1, "proj1", result1.variants[0].name, `${result1.variants[0].fileId}.webp`);
      const variant2Path = path.join(mediaDir2, "proj2", result2.variants[0].name, `${result2.variants[0].fileId}.webp`);

      const buf1 = fs.readFileSync(variant1Path);
      const buf2 = fs.readFileSync(variant2Path);
      expect(buf1.equals(buf2)).toBe(false);
    });

    it("should modify the center of the image with the watermark", async () => {
      const filePath = path.join(tempDir, "center.jpg");
      // Create a uniform red image
      const buffer = await sharp({
        create: { width: 400, height: 300, channels: 3, background: { r: 255, g: 0, b: 0 } }
      }).jpeg({ quality: 100 }).toBuffer();
      fs.writeFileSync(filePath, buffer);

      const result = await processImage(
        filePath, tempDir, "test-project-id", mediaDir, "WATERMARK", "aabb0000ccdd1111eeff2222aabb3333"
      );

      const variantPath = path.join(mediaDir, "test-project-id", result.variants[0].name, `${result.variants[0].fileId}.webp`);
      const variantBuffer = fs.readFileSync(variantPath);

      // Extract center pixel - if watermark is applied, it should differ from pure red
      const { data, info } = await sharp(variantBuffer)
        .raw()
        .toBuffer({ resolveWithObject: true });

      const centerX = Math.floor(info.width / 2);
      const centerY = Math.floor(info.height / 2);
      const pixelOffset = (centerY * info.width + centerX) * info.channels;

      // Center pixel should not be pure red (255, 0, 0) anymore due to watermark overlay
      const r = data[pixelOffset];
      const g = data[pixelOffset + 1];
      const b = data[pixelOffset + 2];
      const isPureRed = r === 255 && g === 0 && b === 0;
      expect(isPureRed).toBe(false);
    });

    it("should return appliedWatermarkRevision in result", async () => {
      const filePath = path.join(tempDir, "rev.jpg");
      await createTestJpeg(800, 600, filePath);

      const wmRevision = "aabb0000ccdd1111eeff2222aabb3333";
      const result = await processImage(
        filePath, tempDir, "test-project-id", mediaDir, "Timeless", wmRevision
      );

      expect(result.appliedWatermarkRevision).toBe(wmRevision);
    });

    it("should return original format and dimensions in result", async () => {
      const filePath = path.join(tempDir, "meta.png");
      await createTestPng(1200, 900, filePath);

      const result = await processImage(
        filePath, tempDir, "test-project-id", mediaDir, "Timeless", "aabb0000ccdd1111eeff2222aabb3333"
      );

      expect(result.originalFormat).toBe("png");
      expect(result.originalWidth).toBe(1200);
      expect(result.originalHeight).toBe(900);
    });

    it("should not expose paths in result metadata", async () => {
      const filePath = path.join(tempDir, "nopath.jpg");
      await createTestJpeg(800, 600, filePath);

      const result = await processImage(
        filePath, tempDir, "test-project-id", mediaDir, "Timeless", "aabb0000ccdd1111eeff2222aabb3333"
      );

      const resultJson = JSON.stringify(result);
      expect(resultJson).not.toContain(tempDir);
      expect(resultJson).not.toContain(mediaDir);
      expect(resultJson).not.toContain("/Users/");
      expect(resultJson).not.toContain("/tmp/");
    });

    it("should rollback completely on failure mid-processing", async () => {
      const filePath = path.join(tempDir, "rollback.jpg");
      await createTestJpeg(2000, 1500, filePath);

      // Make media dir read-only to force failure during write
      const projectDir = path.join(mediaDir, "failing-project");
      fs.mkdirSync(projectDir, { mode: 0o700 });
      const originalsDir = path.join(projectDir, "originals");
      fs.mkdirSync(originalsDir, { mode: 0o700 });

      // Create 480p directory but make it read-only to cause failure
      const dir480 = path.join(projectDir, "480p");
      fs.mkdirSync(dir480, { mode: 0o000 });

      try {
        await expect(processImage(
          filePath, tempDir, "failing-project", mediaDir, "Timeless", "aabb0000ccdd1111eeff2222aabb3333"
        )).rejects.toThrow();
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(dir480, 0o700);
      }
    });

    it("should not expose sensitive paths in error messages", async () => {
      const filePath = path.join(tempDir, "error.txt");
      fs.writeFileSync(filePath, "not an image");

      try {
        await validateImageFile(filePath, tempDir);
        expect.fail("Should have thrown");
      } catch (err) {
        expect((err as Error).message).not.toContain(tempDir);
        expect((err as Error).message).not.toContain(filePath);
      }
    });
  });

  // === Watermark Rendering Tests ===

  describe("Watermark Rendering", () => {
    it("should find the font file from the project root", async () => {
      const svg = await renderTextWatermark({
        text: "Timeless",
        watermarkRevision: "aabb0000ccdd1111eeff2222aabb3333",
        width: 800,
        height: 600,
      });
      expect(svg).toBeInstanceOf(Buffer);
      expect(svg.toString("utf-8")).toContain("CormorantWatermark");
    });

    it("should render with escaped ampersand without Pango error", async () => {
      const svg = await renderTextWatermark({
        text: "Timeless & Co",
        watermarkRevision: "aabb0000ccdd1111eeff2222aabb3333",
        width: 800,
        height: 600,
      });
      const svgText = svg.toString("utf-8");
      expect(svgText).toContain("Timeless &amp; Co");
      expect(svgText).not.toContain("Timeless & Co"); // raw & should be escaped
    });

    it("should escape quotes in SVG rendering", async () => {
      const svg = await renderTextWatermark({
        text: 'Studio "Prestige"',
        watermarkRevision: "aabb0000ccdd1111eeff2222aabb3333",
        width: 800,
        height: 600,
      });
      const svgText = svg.toString("utf-8");
      expect(svgText).toContain("&quot;");
    });
  });
});
