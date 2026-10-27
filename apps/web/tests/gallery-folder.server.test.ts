import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { openGalleryDb, closeGalleryDb, getGalleryDb } from "../app/lib/gallery-db.server";
import { createGallery, getGalleryById } from "../app/lib/gallery.server";
import {
  slugifyGalleryName,
  computeGalleryFolderName,
  validateGalleryFolderConfinement,
  createGalleryFolderOnDisk,
  ensureGalleryImportFolder,
} from "../app/lib/gallery-folder.server";
import { ENV } from "../app/lib/env.server";

describe("Gallery Folder Management (Feature 1)", () => {
  let tmpDir: string;
  let importBase: string;
  let mediaBase: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gallery-folder-test-")));
    importBase = path.join(tmpDir, "imports");
    mediaBase = path.join(tmpDir, "media");
    dbPath = path.join(tmpDir, "gallery.db");

    fs.mkdirSync(importBase, { recursive: true, mode: 0o700 });
    fs.mkdirSync(mediaBase, { recursive: true, mode: 0o700 });

    vi.spyOn(ENV, "GALLERY_DB_PATH", "get").mockReturnValue(dbPath);
    vi.spyOn(ENV, "GALLERY_IMPORT_PATH", "get").mockReturnValue(importBase);
    vi.spyOn(ENV, "GALLERY_MEDIA_PATH", "get").mockReturnValue(mediaBase);

    openGalleryDb(dbPath);
  });

  afterEach(() => {
    closeGalleryDb();
    vi.restoreAllMocks();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("Slugification and Naming", () => {
    it("should clean up and slugify gallery names accurately", () => {
      expect(slugifyGalleryName("Élise & François-Xavier")).toBe("elise-francois-xavier");
      expect(slugifyGalleryName("Sophie & Marc")).toBe("sophie-marc");
      expect(slugifyGalleryName("")).toBe("galerie");
      expect(slugifyGalleryName("   ")).toBe("galerie");
      expect(slugifyGalleryName("///...///")).toBe("galerie");
    });

    it("should generate collision-free folder names including the stable gallery id", () => {
      const folderName = computeGalleryFolderName("gal-uuid-1234", "Sophie & Marc");
      expect(folderName).toBe("sophie-marc-gal-uuid-1234");
    });
  });

  describe("Folder Confinement and Security", () => {
    it("should reject malicious paths containing path traversal tokens", () => {
      expect(() => validateGalleryFolderConfinement("../outside")).toThrow("Tentative de sortie de répertoire interdite");
      expect(() => validateGalleryFolderConfinement("folder/../../etc")).toThrow();
      expect(() => validateGalleryFolderConfinement("folder/subfolder")).toThrow();
      expect(() => validateGalleryFolderConfinement("folder\\subfolder")).toThrow();
      expect(() => validateGalleryFolderConfinement("folder\0evil")).toThrow();
    });

    it("should reject symlinked gallery directories", () => {
      const realTarget = path.join(tmpDir, "external-folder");
      fs.mkdirSync(realTarget, { recursive: true });
      const symlinkPath = path.join(importBase, "symlink-folder");
      fs.symlinkSync(realTarget, symlinkPath);

      expect(() => validateGalleryFolderConfinement("symlink-folder")).toThrow("lien symbolique");
      expect(() => createGalleryFolderOnDisk("symlink-folder")).toThrow("lien symbolique");
    });
  });

  describe("Automatic Creation with New Gallery", () => {
    it("should automatically create photos/ and videos/ subdirectories with private permissions", () => {
      const gallery = createGallery({
        bride_names: "Camille & Thomas",
        wedding_date: "2026-09-12",
      });

      expect(gallery.upload_folder).toBeDefined();
      expect(gallery.upload_folder).toContain("camille-thomas-");

      const folderPath = path.join(importBase, gallery.upload_folder!);
      expect(fs.existsSync(folderPath)).toBe(true);

      const photosDir = path.join(folderPath, "photos");
      const videosDir = path.join(folderPath, "videos");
      expect(fs.existsSync(photosDir)).toBe(true);
      expect(fs.existsSync(videosDir)).toBe(true);

      // Verify 0700 permissions
      const folderStat = fs.statSync(folderPath);
      expect(folderStat.mode & 0o777).toBe(0o700);
      const photosStat = fs.statSync(photosDir);
      expect(photosStat.mode & 0o777).toBe(0o700);
      const videosStat = fs.statSync(videosDir);
      expect(videosStat.mode & 0o777).toBe(0o700);
    });

    it("should create distinct folders without collision for two galleries with the exact same bride names", () => {
      const gal1 = createGallery({
        bride_names: "Sophie & Marc",
        wedding_date: "2026-06-20",
      });

      const gal2 = createGallery({
        bride_names: "Sophie & Marc",
        wedding_date: "2026-07-25",
      });

      expect(gal1.id).not.toBe(gal2.id);
      expect(gal1.upload_folder).not.toBe(gal2.upload_folder);
      expect(gal1.upload_folder).toContain("sophie-marc-");
      expect(gal2.upload_folder).toContain("sophie-marc-");

      const path1 = path.join(importBase, gal1.upload_folder!);
      const path2 = path.join(importBase, gal2.upload_folder!);
      expect(path1).not.toBe(path2);
      expect(fs.existsSync(path1)).toBe(true);
      expect(fs.existsSync(path2)).toBe(true);
    });

    it("should be idempotent when called multiple times on the same folder", () => {
      const folderName = "idempotent-test-gal123";
      const res1 = createGalleryFolderOnDisk(folderName);
      const res2 = createGalleryFolderOnDisk(folderName);

      expect(res1.folderPath).toBe(res2.folderPath);
      expect(fs.existsSync(res1.photosPath)).toBe(true);
      expect(fs.existsSync(res1.videosPath)).toBe(true);
    });
  });

  describe("Existing Galleries without upload_folder (Lazy Creation)", () => {
    it("should lazily create the folder and subdirectories when an existing gallery is first accessed", () => {
      const db = getGalleryDb();
      const existingId = "legacy-gal-999";
      const now = Date.now();

      // Insert gallery manually without upload_folder
      db.prepare(`
        INSERT INTO galleries (
          id, public_id, bride_names, wedding_date, location,
          created_at, expires_at, status,
          guest_code_hash, couple_code_hash, guest_code_encrypted, couple_code_encrypted
        ) VALUES (?, 'legacy-pub', 'Marie & Pierre', '2025-05-10', 'Paris', ?, ?, 'draft', 'h1', 'h2', 'e1', 'e2')
      `).run(existingId, now, now + 100000);

      const legacyBefore = getGalleryById(existingId);
      expect(legacyBefore?.upload_folder).toBeFalsy();

      // Now call ensureGalleryImportFolder
      const res = ensureGalleryImportFolder(existingId);
      expect(res.folderName).toContain("marie-pierre-legacy-gal-999");
      expect(fs.existsSync(res.photosPath)).toBe(true);
      expect(fs.existsSync(res.videosPath)).toBe(true);

      // Verify DB was updated
      const legacyAfter = getGalleryById(existingId);
      expect(legacyAfter?.upload_folder).toBe(res.folderName);
    });

    it("should throw an error for an unknown gallery ID", () => {
      expect(() => ensureGalleryImportFolder("unknown-gallery-id")).toThrow("Galerie introuvable");
    });
  });

  describe("Rollback & Orphan Cleanup on Creation Failure", () => {
    it("should not leave an orphan directory if commit fails after folder creation", () => {
      const db = getGalleryDb();
      const origExec = db.exec.bind(db);
      vi.spyOn(db, "exec").mockImplementation((sql: string) => {
        if (sql.includes("COMMIT")) {
          throw new Error("Simulated COMMIT failure");
        }
        return origExec(sql);
      });

      expect(() =>
        createGallery({
          bride_names: "Orphan Test",
          wedding_date: "2026-10-10",
        })
      ).toThrow("Simulated COMMIT failure");

      // Verify no folder starting with orphan-test exists in importBase
      const files = fs.readdirSync(importBase);
      const orphan = files.filter(f => f.startsWith("orphan-test-"));
      expect(orphan.length).toBe(0);

      // Verify no gallery was committed to the DB
      const galleries = db.prepare("SELECT * FROM galleries WHERE bride_names = 'Orphan Test'").all();
      expect(galleries.length).toBe(0);
    });
  });
});
