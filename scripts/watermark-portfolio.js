#!/usr/bin/env node

/**
 * Script to add a watermark to portfolio photos and convert them to WebP/AVIF.
 * Usage: node scripts/watermark-portfolio.js
 * 
 * Dependencies:
 * npm install sharp --save-dev
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INPUT_DIR = path.join(__dirname, '../data/media/raw');
const OUTPUT_DIR = path.join(__dirname, '../apps/web/public/media/portfolio');
const WATERMARK_TEXT = 'Timeless';

async function processImages() {
  if (!fs.existsSync(INPUT_DIR)) {
    console.log(`Input directory does not exist: ${INPUT_DIR}`);
    console.log('Please create it and add raw images.');
    // Create it for convenience
    fs.mkdirSync(INPUT_DIR, { recursive: true });
    return;
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const files = fs.readdirSync(INPUT_DIR).filter(file => 
    file.match(/\.(jpg|jpeg|png|tiff|webp)$/i)
  );

  if (files.length === 0) {
    console.log(`No images found in ${INPUT_DIR}`);
    return;
  }

  console.log(`Found ${files.length} images. Processing...`);

  // Create an SVG watermark
  const watermarkSvg = `
    <svg width="400" height="150" viewBox="0 0 400 150" xmlns="http://www.w3.org/2000/svg">
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="rgba(255, 255, 255, 0.5)" text-anchor="middle" dominant-baseline="middle">
        ${WATERMARK_TEXT}
      </text>
    </svg>
  `;
  const watermarkBuffer = Buffer.from(watermarkSvg);

  for (const file of files) {
    const inputPath = path.join(INPUT_DIR, file);
    const basename = path.parse(file).name;
    const outputPathWebP = path.join(OUTPUT_DIR, `${basename}.webp`);
    const outputPathAvif = path.join(OUTPUT_DIR, `${basename}.avif`);

    try {
      console.log(`Processing ${file}...`);
      
      const image = sharp(inputPath);
      const metadata = await image.metadata();
      
      // Calculate watermark size based on image size
      const wmWidth = Math.max(Math.round(metadata.width * 0.3), 200);
      
      const resizedWatermark = await sharp(watermarkBuffer)
        .resize({ width: wmWidth })
        .toBuffer();

      // Common pipeline with watermark
      const pipeline = image
        .composite([
          {
            input: resizedWatermark,
            gravity: 'southeast',
            blend: 'over'
          }
        ]);

      // Output WebP
      await pipeline.clone()
        .webp({ quality: 80, effort: 6 })
        .toFile(outputPathWebP);
        
      // Output AVIF
      await pipeline.clone()
        .avif({ quality: 75, effort: 6 })
        .toFile(outputPathAvif);
        
      console.log(`  ✓ Created ${basename}.webp and ${basename}.avif`);
    } catch (err) {
      console.error(`  ✗ Error processing ${file}:`, err);
    }
  }
  
  console.log('Processing complete!');
}

processImages().catch(console.error);
