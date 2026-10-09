import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";

describe("generate-previews script", () => {
  let tempDir: string;
  let dbPath: string;
  let mediaPath: string;

  beforeAll(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "timeless-script-test-")));
    dbPath = path.join(tempDir, "gallery.db");
    mediaPath = path.join(tempDir, "media");

    fs.mkdirSync(mediaPath, { recursive: true });

    // We will let the script initialize it or we can initialize it by importing getGalleryDb.
    process.env.GALLERY_DB_PATH = dbPath;
    process.env.NODE_ENV = "development";
    const { getGalleryDb } = await import("../app/lib/gallery-db.server");
    const db = getGalleryDb();
    
    db.prepare("INSERT INTO galleries (id, public_id, bride_names, wedding_date, created_at, expires_at, status, guest_code_hash, couple_code_hash, guest_code_encrypted, couple_code_encrypted) VALUES ('gal1', 'pub', 'A', 'B', 0, 0, 'published', 'a', 'b', 'c', 'd')").run();
    db.prepare("INSERT INTO gallery_media (id, gallery_id, type, visibility, created_at, original_name, mime_type, size, hash) VALUES ('photo1', 'gal1', 'photo', 'invites', 0, 'photo1.jpg', 'image/jpeg', 10, 'hash')").run();
    db.prepare("INSERT INTO gallery_media (id, gallery_id, type, visibility, created_at, original_name, mime_type, size, hash) VALUES ('vid1', 'gal1', 'video', 'invites', 0, 'vid1.mp4', 'video/mp4', 10, 'hash')").run(); // Should be ignored
    
    // Valid image
    const photo1Path = path.join(mediaPath, "gal1", "photo1");
    fs.mkdirSync(path.dirname(photo1Path), { recursive: true });
    await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } } }).jpeg().toFile(photo1Path);
    db.close();
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should generate previews for photos and skip videos", async () => {
    const env = {
      ...process.env,
      NODE_ENV: "development",
      GALLERY_DB_PATH: dbPath,
      GALLERY_MEDIA_PATH: mediaPath
    };

    const scriptPath = path.resolve(__dirname, "../scripts/generate-previews.ts");
    
    const proc = spawn("npx", ["tsx", scriptPath], { env });
    
    let output = "";
    proc.stdout.on("data", (d) => output += d.toString());
    proc.stderr.on("data", (d) => output += d.toString());
    
    const exitCode = await new Promise((resolve) => proc.on("close", resolve));
    
    if (exitCode !== 0) {
      console.error(output);
    }
    expect(exitCode).toBe(0);
    expect(output).toContain("1 photos trouvées."); // only the photo is counted
    expect(output).toContain("- Previews générées: 3"); // 480, 960, 1920
    expect(output).toContain("- Previews ignorées (déjà présentes): 0");
    
    // Verify files
    const previewsDir = path.join(mediaPath, "gal1", ".previews", "photo1");
    expect(fs.existsSync(path.join(previewsDir, "480.webp"))).toBe(true);
    expect(fs.existsSync(path.join(previewsDir, "960.webp"))).toBe(true);
    expect(fs.existsSync(path.join(previewsDir, "1920.webp"))).toBe(true);
  });
  
  it("should be idempotent and return early if previews exist", async () => {
    const env = {
      ...process.env,
      NODE_ENV: "development",
      GALLERY_DB_PATH: dbPath,
      GALLERY_MEDIA_PATH: mediaPath
    };

    const scriptPath = path.resolve(__dirname, "../scripts/generate-previews.ts");
    const proc = spawn("npx", ["tsx", scriptPath], { env });
    
    let output = "";
    proc.stdout.on("data", (d) => output += d.toString());
    proc.stderr.on("data", (d) => output += d.toString());
    
    const exitCode = await new Promise((resolve) => proc.on("close", resolve));
    
    expect(exitCode).toBe(0);
    expect(output).toContain("- Previews générées: 0"); 
    expect(output).toContain("- Previews ignorées (déjà présentes): 3");
  });
});
