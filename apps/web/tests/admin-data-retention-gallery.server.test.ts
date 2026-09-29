import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { getGalleryDb, deleteGalleryAndQuarantine, closeGalleryDb } from "../app/lib/gallery-db.server";
import { processGalleryDeletions } from "../app/lib/gallery-deletion-worker.server";
import { ENV } from "../app/lib/env.server";
import { DatabaseSync } from "node:sqlite";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    rmSync: vi.fn((path, options) => {
      if ((globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow as boolean) {
        throw new Error("EPERM mock");
      }
      return actual.rmSync(path, options);
    })
  };
});

let tmpDir: string;
let db: DatabaseSync;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-gallery-test-"));
  const dbPath = path.join(tmpDir, "gallery.sqlite");
  vi.spyOn(ENV, "GALLERY_DB_PATH", "get").mockReturnValue(dbPath);
  vi.spyOn(ENV, "GALLERY_MEDIA_PATH", "get").mockReturnValue(path.join(tmpDir, "media"));
  vi.spyOn(process, "cwd").mockReturnValue(tmpDir); // quarantine will use data/.trash inside cwd

  fs.mkdirSync(path.join(tmpDir, "media"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "imports"), { recursive: true });

  db = getGalleryDb();

  // Create two galleries
  db.prepare(`
    INSERT INTO galleries (id, public_id, bride_names, wedding_date, status, expires_at, created_at, guest_code_hash, couple_code_hash, guest_code_encrypted, couple_code_encrypted, import_path)
    VALUES 
    ('gal-1', 'gal-pub-1', 'A & B', '2025', 'published', ?, ?, 'hash1', 'hash2', 'enc1', 'enc2', 'import-folder-1'),
    ('gal-2', 'gal-pub-2', 'C & D', '2025', 'published', ?, ?, 'hash3', 'hash4', 'enc3', 'enc4', 'import-folder-2')
  `).run(Date.now() + 100000, Date.now(), Date.now() + 100000, Date.now());

  db.prepare(`
    INSERT INTO gallery_media (id, gallery_id, type, visibility, sort_order, original_name, mime_type, created_at, size, hash)
    VALUES ('med-1', 'gal-1', 'photo', 'invites', 0, 'test.jpg', 'image/jpeg', ?, 100, 'abc123hash')
  `).run(Date.now());

  // Setup actual files
  const gal1Media = path.join(tmpDir, "media", "gal-1");
  fs.mkdirSync(gal1Media);
  fs.writeFileSync(path.join(gal1Media, "med-1.jpg"), "fake-image");

  const gal2Media = path.join(tmpDir, "media", "gal-2");
  fs.mkdirSync(gal2Media);
  fs.writeFileSync(path.join(gal2Media, "test.jpg"), "fake-image-2");

  const import1 = path.join(tmpDir, "imports", "import-folder-1");
  fs.mkdirSync(import1);
  fs.writeFileSync(path.join(import1, "original.jpg"), "import-data");
});

afterEach(() => {
  (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = false;
  vi.restoreAllMocks();
  closeGalleryDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Gallery Deletion & Data Retention", () => {
  it("le dossier source d'import reste intact et la quarantaine est unique", () => {
    deleteGalleryAndQuarantine("gal-1");

    // L'import source doit exister
    expect(fs.existsSync(path.join(tmpDir, "imports", "import-folder-1", "original.jpg"))).toBe(true);

    // Le dossier géré (media) doit avoir été déplacé
    expect(fs.existsSync(path.join(tmpDir, "media", "gal-1"))).toBe(false);

    const job = db.prepare("SELECT * FROM gallery_deletion_jobs WHERE gallery_id = ?").get("gal-1") as unknown as { status: string; error_message: string | null; relative_quarantine_path: string; attempt_count: number; import_path?: string };
    expect(job).toBeDefined();
    expect(job.status).toBe("completed"); // It deleted quarantine successfully right away!
    expect(job.relative_quarantine_path).toBeDefined();
    expect(job.import_path).toBeUndefined(); // Schema test: import_path n'existe pas

    const trashDir = path.resolve(tmpDir, job.relative_quarantine_path);
    // Puisque le nettoyage final a réussi, trashDir doit être supprimé !
    expect(fs.existsSync(trashDir)).toBe(false);

    // La galerie n'existe plus
    const gal = db.prepare("SELECT * FROM galleries WHERE id = ?").get("gal-1");
    expect(gal).toBeUndefined();

    // Les autres galeries sont intactes
    expect(fs.existsSync(path.join(tmpDir, "media", "gal-2"))).toBe(true);
    expect(db.prepare("SELECT * FROM galleries WHERE id = ?").get("gal-2")).toBeDefined();
  });

  it("une erreur de nettoyage crée une tâche pending", () => {
    // On simule une erreur lors du rmSync
    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = true;

    expect(() => deleteGalleryAndQuarantine("gal-1")).toThrow(/Gallery deleted but final cleanup failed/);

    const job = db.prepare("SELECT * FROM gallery_deletion_jobs WHERE gallery_id = ?").get("gal-1") as unknown as { status: string; error_message: string | null; relative_quarantine_path: string; attempt_count: number; import_path?: string };
    expect(job).toBeDefined();
    expect(job.status).toBe("pending");
    expect(job.attempt_count).toBe(1);

    const trashDir = path.resolve(tmpDir, job.relative_quarantine_path);
    // Le dossier est toujours dans la quarantaine technique
    expect(fs.existsSync(trashDir)).toBe(true);
  });

  it("une reprise réussie par le worker supprime la quarantaine et termine la tâche", () => {
    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = true;
    expect(() => deleteGalleryAndQuarantine("gal-1")).toThrow();

    const jobBefore = db.prepare("SELECT * FROM gallery_deletion_jobs WHERE gallery_id = ?").get("gal-1") as unknown as { status: string; error_message: string | null; relative_quarantine_path: string; attempt_count: number; import_path?: string };
    expect(jobBefore.status).toBe("pending");

    // Worker run
    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = false;
    processGalleryDeletions();

    const jobAfter = db.prepare("SELECT * FROM gallery_deletion_jobs WHERE gallery_id = ?").get("gal-1") as unknown as { status: string; error_message: string | null; relative_quarantine_path: string; attempt_count: number; import_path?: string };
    expect(jobAfter.status).toBe("completed");
    expect(jobAfter.error_message).toBeNull();
    const trashDir = path.resolve(tmpDir, jobAfter.relative_quarantine_path);
    expect(fs.existsSync(trashDir)).toBe(false); // Le dossier est maintenant supprimé
  });

  it("une erreur SQL restaure les fichiers", () => {
    // Simuler une erreur SQL pendant la transaction de suppression
    const originalPrepare = db.prepare.bind(db);
    vi.spyOn(db, "prepare").mockImplementation((sql: string) => {
      if (sql.includes("DELETE FROM galleries")) {
        return { run: () => { throw new Error("SQL mock error") } } as unknown as import("node:sqlite").StatementSync;
      }
      return originalPrepare(sql);
    });

    expect(() => deleteGalleryAndQuarantine("gal-1")).toThrow("SQL mock error");

    // La base n'est pas modifiée
    expect(db.prepare("SELECT * FROM galleries WHERE id = ?").get("gal-1")).toBeDefined();
    
    // Les fichiers gérés (media) ont été RESTAURÉS depuis la quarantaine !
    expect(fs.existsSync(path.join(tmpDir, "media", "gal-1"))).toBe(true);
    
    const jobs = db.prepare("SELECT * FROM gallery_deletion_jobs").all();
    expect(jobs.length).toBe(0); // Rollback réussi
  });

  it("les liens symboliques sont rejetés", () => {
    // On remplace le dossier media par un symlink
    fs.rmSync(path.join(tmpDir, "media", "gal-1"), { recursive: true });
    const fakeDir = path.join(tmpDir, "fake");
    fs.mkdirSync(fakeDir);
    fs.symlinkSync(fakeDir, path.join(tmpDir, "media", "gal-1"), "dir");

    expect(() => deleteGalleryAndQuarantine("gal-1")).toThrow("Media directory cannot be a symbolic link");
    expect(db.prepare("SELECT * FROM galleries WHERE id = ?").get("gal-1")).toBeDefined();
  });
  
  it("aucun chemin ne sort de la racine autorisée", () => {
    // Si la galerie avait un id style ../etc
    const badId = "../etc/passwd";
    db.prepare(`
      INSERT INTO galleries (id, public_id, bride_names, wedding_date, status, expires_at, created_at, guest_code_hash, couple_code_hash, guest_code_encrypted, couple_code_encrypted, import_path)
      VALUES (?, 'pub-3', 'A & B', '2025', 'published', ?, ?, 'h1', 'h2', 'e1', 'e2', 'imp')
    `).run(badId, Date.now(), Date.now());

    expect(() => deleteGalleryAndQuarantine(badId)).toThrow("Invalid gallery ID");
  });
});
