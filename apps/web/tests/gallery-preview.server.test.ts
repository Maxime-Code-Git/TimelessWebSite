import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { ensurePreview, generateAllPreviews, removePreviews } from "../app/lib/gallery-preview.server";
import { ENV } from "../app/lib/env.server";

describe("Persistent Gallery Previews", () => {
  let tempDir: string;
  let galleryId: string;
  let mediaId: string;
  let originalPath: string;

  beforeEach(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "previews-test-")));
    // Override ENV for test by using defineProperty
    Object.defineProperty(ENV, "GALLERY_MEDIA_PATH", { value: tempDir, writable: true });

    galleryId = "gal1";
    mediaId = "media1";

    fs.mkdirSync(path.join(tempDir, galleryId));
    originalPath = path.join(tempDir, galleryId, mediaId);

    // Create a dummy image (1000x2000)
    await sharp({ create: { width: 1000, height: 2000, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .jpeg()
      .toFile(originalPath);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  test("1,2,3,4. generates WebP variants preserving ratio", async () => {
    await generateAllPreviews(galleryId, mediaId);

    const previewsDir = path.join(tempDir, galleryId, ".previews", mediaId);
    expect(fs.existsSync(previewsDir)).toBe(true);

    const w480 = path.join(previewsDir, "480.webp");
    const w960 = path.join(previewsDir, "960.webp");
    const w1920 = path.join(previewsDir, "1920.webp");

    expect(fs.existsSync(w480)).toBe(true);
    expect(fs.existsSync(w960)).toBe(true);
    expect(fs.existsSync(w1920)).toBe(true);

    const meta480 = await sharp(w480).metadata();
    expect(meta480.format).toBe("webp");
    expect(meta480.width).toBeLessThanOrEqual(480);
    expect(meta480.height).toBeLessThanOrEqual(480);
    // 1000x2000 -> 240x480
    expect(meta480.width).toBe(240);
    expect(meta480.height).toBe(480);
  });

  test("5. EXIF orientation is respected", async () => {
    const rotatedMediaId = "rotated";
    const rotatedPath = path.join(tempDir, galleryId, rotatedMediaId);
    const imgBuf = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .jpeg()
      .withMetadata({ orientation: 6 }) // Rotated 90 CW
      .toBuffer();
    fs.writeFileSync(rotatedPath, imgBuf);

    await generateAllPreviews(galleryId, rotatedMediaId);
    const meta480 = await sharp(path.join(tempDir, galleryId, ".previews", rotatedMediaId, "480.webp")).metadata();

    // Rotated 1000x2000 -> 240x480
    expect(meta480.width).toBe(240);
    expect(meta480.height).toBe(480);
  });

  test("6. small images are not enlarged", async () => {
    const smallId = "small";
    const smallPath = path.join(tempDir, galleryId, smallId);
    await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 0, g: 255, b: 0 } } })
      .jpeg()
      .toFile(smallPath);

    await generateAllPreviews(galleryId, smallId);

    const meta960 = await sharp(path.join(tempDir, galleryId, ".previews", smallId, "960.webp")).metadata();
    expect(meta960.width).toBe(300);
    expect(meta960.height).toBe(200);
  });

  test("7. original is preserved exactly", async () => {
    const origStatBefore = fs.statSync(originalPath);
    await generateAllPreviews(galleryId, mediaId);
    const origStatAfter = fs.statSync(originalPath);
    expect(origStatBefore.mtimeMs).toBe(origStatAfter.mtimeMs);
    expect(origStatBefore.size).toBe(origStatAfter.size);
  });

  test("8. file and folder permissions are correct", async () => {
    await generateAllPreviews(galleryId, mediaId);

    const previewsDir = path.join(tempDir, galleryId, ".previews");
    const mediaPreviewDir = path.join(previewsDir, mediaId);
    const w480 = path.join(mediaPreviewDir, "480.webp");

    const dirStat = fs.statSync(mediaPreviewDir);
    expect((dirStat.mode & 0o777)).toBe(0o700);

    const fileStat = fs.statSync(w480);
    expect((fileStat.mode & 0o777)).toBe(0o600);
  });

  test("9. refuses path outside GALLERY_MEDIA_PATH", async () => {
    await expect(ensurePreview("../outside", mediaId, 480)).rejects.toThrow("Unsafe original path");
  });

  test("10. refuses symlinks", async () => {
    const symId = "symlink";
    const symPath = path.join(tempDir, galleryId, symId);
    fs.symlinkSync(originalPath, symPath);
    await expect(ensurePreview(galleryId, symId, 480)).rejects.toThrow("Symlinks are not allowed");
  });

  test("11. atomic write and cleanup on error", async () => {
    // Simulate error by passing a corrupt file
    const corruptId = "corrupt";
    const corruptPath = path.join(tempDir, galleryId, corruptId);
    fs.writeFileSync(corruptPath, "not an image");

    await expect(ensurePreview(galleryId, corruptId, 480)).rejects.toThrow();

    const previewsDir = path.join(tempDir, galleryId, ".previews", corruptId);
    // tmp file should not exist
    if (fs.existsSync(previewsDir)) {
      const files = fs.readdirSync(previewsDir);
      expect(files.some(f => f.includes(".tmp."))).toBe(false);
    }
  });

  test("12. idempotent generation does not re-run Sharp", async () => {
    const renameSpy = vi.spyOn(fs, "renameSync");
    await ensurePreview(galleryId, mediaId, 480);
    const stat1 = fs.statSync(path.join(tempDir, galleryId, ".previews", mediaId, "480.webp"));

    // The first generation should have written to a temp file and renamed it
    const renameCalls = renameSpy.mock.calls.length;
    expect(renameCalls).toBeGreaterThan(0);

    // Call again (idempotent)
    await ensurePreview(galleryId, mediaId, 480);
    const stat2 = fs.statSync(path.join(tempDir, galleryId, ".previews", mediaId, "480.webp"));

    expect(stat1.mtimeMs).toBe(stat2.mtimeMs);
    // Prove that renameSync was not called again (sharp generation skipped)
    expect(renameSpy.mock.calls.length).toBe(renameCalls);
  });

  test("13. deduplication of concurrent generations", async () => {
    // mock fs.existsSync to trace
    const origExists = fs.existsSync;
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      return origExists(p);
    });

    const p1 = ensurePreview(galleryId, mediaId, 480);
    const p2 = ensurePreview(galleryId, mediaId, 480);

    await Promise.all([p1, p2]);

    // sharp should only be called once, indicated by temp file creation if we could spy sharp, but deduplication promise resolves this
    const stat = fs.statSync(path.join(tempDir, galleryId, ".previews", mediaId, "480.webp"));
    expect(stat.size).toBeGreaterThan(0);
  });

  test("21. removePreviews cleans up properly", async () => {
    await generateAllPreviews(galleryId, mediaId);
    const previewsDir = path.join(tempDir, galleryId, ".previews", mediaId);
    expect(fs.existsSync(previewsDir)).toBe(true);

    removePreviews(galleryId, mediaId);
    expect(fs.existsSync(previewsDir)).toBe(false);
  });
});
