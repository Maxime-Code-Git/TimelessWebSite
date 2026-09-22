import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import crypto from "node:crypto";

const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "timeless-watermark-test-")));
const mediaDir = path.join(tempDir, "media");
fs.mkdirSync(mediaDir, { mode: 0o700 });
process.env.SITE_MEDIA_PATH = mediaDir;
process.env.PORTFOLIO_MEDIA_PATH = mediaDir;
process.env.MEDIA_BASE_PATH = mediaDir;

import * as homeMedia from "../app/lib/home-media.server";
import * as portfolioMedia from "../app/lib/portfolio-image.server";
import { _resetFontCache } from "../app/lib/portfolio-image.server";

// Mock renderTextWatermark
vi.mock("../app/lib/portfolio-image.server", async (importOriginal) => {
  const actual = await importOriginal<typeof portfolioMedia>();
  return {
    ...actual,
    renderTextWatermark: vi.fn().mockResolvedValue(Buffer.from("<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"100\" height=\"100\" fill=\"transparent\"/></svg>"))
  };
});

describe("Watermark Policy Verification", () => {
  beforeEach(() => {
    _resetFontCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function createTestImage(): Promise<string> {
    const filePath = path.join(mediaDir, `test-${crypto.randomUUID()}.jpg`);
    const buffer = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: { r: 0, g: 0, b: 0 } }
    }).jpeg().toBuffer();
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  it("should NOT apply watermark on hero", async () => {
    const file = await createTestImage();
    const renderSpy = vi.spyOn(portfolioMedia, "renderTextWatermark");
    await homeMedia.processHomeImage(file, mediaDir, "hero", "wm", "wm-rev");
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("should NOT apply watermark on studio", async () => {
    const file = await createTestImage();
    const renderSpy = vi.spyOn(portfolioMedia, "renderTextWatermark");
    await homeMedia.processHomeImage(file, mediaDir, "studio", "wm", "wm-rev");
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("should APPLY watermark on about-team", async () => {
    const file = await createTestImage();
    const renderSpy = vi.spyOn(portfolioMedia, "renderTextWatermark");
    await homeMedia.processHomeImage(file, mediaDir, "about-team", "wm", "wm-rev");
    expect(renderSpy).toHaveBeenCalled();
  });

  it("should NOT apply watermark on portfolio-photo", async () => {
    const file = await createTestImage();
    const renderSpy = vi.spyOn(portfolioMedia, "renderTextWatermark");
    await homeMedia.processHomeImage(file, mediaDir, "portfolio-photo", "wm", "wm-rev");
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it("should NOT apply watermark on portfolio-video", async () => {
    const file = await createTestImage();
    const renderSpy = vi.spyOn(portfolioMedia, "renderTextWatermark");
    await homeMedia.processHomeImage(file, mediaDir, "portfolio-video", "wm", "wm-rev");
    expect(renderSpy).not.toHaveBeenCalled();
  });
});
