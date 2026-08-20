import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tempRawDir: string;
let tempOutDir: string;
let testImgPath: string;

describe('Watermark Script', () => {
  beforeAll(async () => {
    // Create temporary directories
    const tmpBase = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'timeless-'));
    tempRawDir = path.join(tmpBase, 'raw');
    tempOutDir = path.join(tmpBase, 'out');
    fs.mkdirSync(tempRawDir, { recursive: true });
    fs.mkdirSync(tempOutDir, { recursive: true });

    testImgPath = path.join(tempRawDir, 'test-image.jpg');

    // Create a dummy solid color image for testing
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
    .jpeg()
    .toFile(testImgPath);

    // Run the script
    execSync('node scripts/watermark-portfolio.js', {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, INPUT_DIR: tempRawDir, OUTPUT_DIR: tempOutDir },
      stdio: 'inherit'
    });
  });

  afterAll(() => {
    // Cleanup temp directory
    fs.rmSync(path.dirname(tempRawDir), { recursive: true, force: true });
  });

  it('should generate WebP and AVIF files', () => {
    expect(fs.existsSync(path.join(tempOutDir, 'test-image.webp'))).toBe(true);
    expect(fs.existsSync(path.join(tempOutDir, 'test-image.avif'))).toBe(true);
  });

  it('should strip metadata', async () => {
    const webpPath = path.join(tempOutDir, 'test-image.webp');
    const metadata = await sharp(webpPath).metadata();

    // sharp automatically strips metadata unless withMetadata is called.
    expect(metadata.exif).toBeUndefined();
  });

  it('should exit with non-zero code on invalid image', () => {
    const invalidImgPath = path.join(tempRawDir, 'invalid-image.jpg');
    fs.writeFileSync(invalidImgPath, 'not a real image');

    let exitCode = 0;
    try {
      execSync('node scripts/watermark-portfolio.js', {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, INPUT_DIR: tempRawDir, OUTPUT_DIR: tempOutDir },
        stdio: 'ignore'
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) {
        exitCode = (error as { status: number }).status;
      } else {
        exitCode = 1;
      }
    }
    expect(exitCode).toBe(1);
  });
});
