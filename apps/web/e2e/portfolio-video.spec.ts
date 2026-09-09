import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

type VideoConfig = { provider: 'youtube'; videoId: string } | { provider: 'vimeo'; videoId: string } | null;

function makePortfolio(video: VideoConfig) {
  const now = new Date().toISOString();
  const revision = crypto.randomBytes(16).toString('hex');
  return {
    schemaVersion: 2,
    revision,
    updatedAt: now,
    categories: [],
    photos: [],
    video,
    watermark: {
      mode: "text",
      text: "Sempra",
      revision: "00000000000000000000000000000000",
      updatedAt: now,
    },
  };
}

function safeWriteFileSync(filePath: string, content: string) {
  const resolvedPath = path.resolve(filePath);
  const rel = path.relative(os.tmpdir(), resolvedPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error("Security Error: Path is outside of temp directory");
  }
  const forbiddenDirs = ['data', 'public', 'build'];
  if (forbiddenDirs.some(d => resolvedPath.includes(`/${d}/`))) {
    throw new Error("Security Error: Path is inside a restricted directory");
  }

  fs.writeFileSync(resolvedPath, content);
  fs.chmodSync(resolvedPath, 0o600);
}

test.describe('Portfolio Video Player', () => {
  let contentPath: string;

  test.beforeEach(() => {
    contentPath = process.env.PORTFOLIO_CONTENT_PATH!;
    if (!contentPath) {
      throw new Error("Safety check failed: PORTFOLIO_CONTENT_PATH is missing");
    }
    const resolvedPath = path.resolve(contentPath);
    const rel = path.relative(os.tmpdir(), resolvedPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error("Safety check failed: PORTFOLIO_CONTENT_PATH is outside of temp directory");
    }
  });

  test.afterEach(() => {
    // Reset to no video
    safeWriteFileSync(contentPath, JSON.stringify(makePortfolio(null)));
  });

  test('should display video section, play youtube video on click, and have fallback', async ({ page }) => {
    safeWriteFileSync(contentPath, JSON.stringify(makePortfolio({ provider: 'youtube', videoId: 'skvXrMgUldc' })));

    await page.goto('/fr/portfolio');
    const videoSection = page.locator('#galerie-video');
    await expect(videoSection).toBeVisible();

    const playBtn = videoSection.locator('button').first();
    const btnClass = await playBtn.getAttribute('class');
    expect(btnClass).not.toContain('undefined');
    expect(btnClass).toContain('videoPlayBtn');

    let iframe = videoSection.locator('iframe');
    await expect(iframe).toHaveCount(0);

    // Intercept youtube to avoid loading remote content
    await page.route('**/*youtube-nocookie.com*', route => route.fulfill({ body: '<html><body></body></html>', contentType: 'text/html' }));

    await playBtn.scrollIntoViewIfNeeded();
    await playBtn.click();
    await expect(playBtn).toHaveCount(0);

    iframe = videoSection.locator('iframe');
    await expect(iframe).toHaveCount(1);
    await expect(iframe).toBeVisible();

    const src = await iframe.getAttribute('src');
    expect(src).toBe('https://www.youtube-nocookie.com/embed/skvXrMgUldc?autoplay=1');

    const box = await iframe.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }

    const fallbackLink = videoSection.locator('a[target="_blank"]');
    await expect(fallbackLink).toBeVisible();
    await expect(fallbackLink).toHaveAttribute('href', 'https://www.youtube.com/watch?v=skvXrMgUldc');
    await expect(fallbackLink).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(fallbackLink).toContainText('Ouvrir la vidéo sur YouTube');

    // Ensure fallback link is not inside videoPlayerWrap
    const playerWrapLink = videoSection.locator('[class*="videoPlayerWrap"] a[target="_blank"]');
    await expect(playerWrapLink).toHaveCount(0);
  });

  test('should display video section, play vimeo video on click, and have fallback', async ({ page }) => {
    safeWriteFileSync(contentPath, JSON.stringify(makePortfolio({ provider: 'vimeo', videoId: '76979871' })));

    await page.goto('/fr/portfolio');
    const videoSection = page.locator('#galerie-video');
    await expect(videoSection).toBeVisible();

    const playBtn = videoSection.locator('button').first();
    let iframe = videoSection.locator('iframe');
    await expect(iframe).toHaveCount(0);

    // Intercept vimeo to avoid loading remote content
    await page.route('**/*player.vimeo.com*', route => route.fulfill({ body: '<html><body></body></html>', contentType: 'text/html' }));

    await playBtn.scrollIntoViewIfNeeded();
    await playBtn.click();

    iframe = videoSection.locator('iframe');
    await expect(iframe).toHaveCount(1);
    await expect(iframe).toBeVisible();

    const src = await iframe.getAttribute('src');
    expect(src).toBe('https://player.vimeo.com/video/76979871?autoplay=1');

    const box = await iframe.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }

    const fallbackLink = videoSection.locator('a[target="_blank"]');
    await expect(fallbackLink).toBeVisible();
    await expect(fallbackLink).toHaveAttribute('href', 'https://vimeo.com/76979871');
    await expect(fallbackLink).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(fallbackLink).toContainText('Ouvrir la vidéo sur Vimeo');

    // Ensure fallback link is not inside videoPlayerWrap
    const playerWrapLink = videoSection.locator('[class*="videoPlayerWrap"] a[target="_blank"]');
    await expect(playerWrapLink).toHaveCount(0);
  });

  test('should not display video section when no video is configured', async ({ page }) => {
    safeWriteFileSync(contentPath, JSON.stringify(makePortfolio(null)));

    await page.goto('/fr/portfolio');

    const videoSection = page.locator('#galerie-video');
    await expect(videoSection).toHaveCount(0);
  });
});
