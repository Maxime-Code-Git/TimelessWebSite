import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.join(__dirname, '../data/media/raw');
const outDir = path.join(__dirname, '../apps/web/public/media/portfolio');
const testImgPath = path.join(rawDir, 'test-image.jpg');

describe('Watermark Script', () => {
  beforeAll(async () => {
    // Ensure directories exist
    if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });
    
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
      stdio: 'ignore'
    });
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(testImgPath)) fs.unlinkSync(testImgPath);
    const webpPath = path.join(outDir, 'test-image.webp');
    const avifPath = path.join(outDir, 'test-image.avif');
    if (fs.existsSync(webpPath)) fs.unlinkSync(webpPath);
    if (fs.existsSync(avifPath)) fs.unlinkSync(avifPath);
  });

  it('should generate WebP and AVIF files', () => {
    expect(fs.existsSync(path.join(outDir, 'test-image.webp'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'test-image.avif'))).toBe(true);
  });

  it('should strip metadata', async () => {
    const webpPath = path.join(outDir, 'test-image.webp');
    const metadata = await sharp(webpPath).metadata();
    
    // sharp automatically strips metadata unless withMetadata is called.
    // Exif data should be undefined
    expect(metadata.exif).toBeUndefined();
  });
});
