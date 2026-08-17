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

const INPUT_DIR = process.env.INPUT_DIR || path.join(__dirname, '../data/media/raw');
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, '../apps/web/public/media/portfolio');
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

  const watermarkSvg = `
    <svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
      <text x="50%" y="50%" transform="rotate(-45 400 400)" font-family="Arial, sans-serif" font-size="120" font-weight="bold" fill="rgba(255, 255, 255, 0.4)" text-anchor="middle" dominant-baseline="middle">
        ${WATERMARK_TEXT}
      </text>
    </svg>
  `;
  const watermarkBuffer = Buffer.from(watermarkSvg);

  let hasError = false;

  for (const file of files) {
    const inputPath = path.join(INPUT_DIR, file);
    const basename = path.parse(file).name;
    const outputPathWebP = path.join(OUTPUT_DIR, `${basename}.webp`);
    const outputPathAvif = path.join(OUTPUT_DIR, `${basename}.avif`);

    try {
      console.log(`Processing ${file}...`);
      
      const image = sharp(inputPath);
      const metadata = await image.metadata();
      
      // Calculate watermark size based on image size to ensure it fits both width and height
      const wmSize = Math.floor(Math.min(metadata.width, metadata.height) * 0.8);
      
      const resizedWatermark = await sharp(watermarkBuffer)
        .resize({ width: wmSize })
        .toBuffer();

      // Common pipeline with watermark
      const pipeline = image
        .composite([
          {
            input: resizedWatermark,
            gravity: 'center',
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
      hasError = true;
    }
  }
  
  console.log('Processing complete!');
  if (hasError) {
    process.exit(1);
  }
}

processImages().catch(console.error);
