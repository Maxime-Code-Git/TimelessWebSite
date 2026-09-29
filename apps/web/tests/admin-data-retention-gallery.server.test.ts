import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { openGalleryDb, deleteGalleryAndQuarantine, deleteGalleriesAndQuarantineBulk, closeGalleryDb } from "../app/lib/gallery-db.server";
import { processGalleryDeletions, retryFailedJob } from "../app/lib/gallery-deletion-worker.server";
import { ENV } from "../app/lib/env.server";
import { DatabaseSync } from "node:sqlite";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    rmSync: vi.fn((p, options) => {
      if ((globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow) {
        throw new Error("EPERM mock");
      }
      return actual.rmSync(p, options);
    })
  };
});

let tmpDir: string;
let db: DatabaseSync;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-gallery-test-"));
  const dbPath = path.join(tmpDir, "gallery.sqlite");
  vi.spyOn(ENV, "GALLERY_DB_PATH", "get").mockReturnValue(dbPath);
  vi.spyOn(ENV, "GALLERY_MEDIA_PATH", "get").mockReturnValue(path.join(tmpDir, "media"));

  fs.mkdirSync(path.join(tmpDir, "media"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "imports"), { recursive: true });

  db = await import("../app/lib/gallery-db.server").then(m => m.getGalleryDb());

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
  it("le dossier source d'import reste strictement intact", () => {
    deleteGalleryAndQuarantine("gal-1");

    // Import source MUST still exist
    expect(fs.existsSync(path.join(tmpDir, "imports", "import-folder-1", "original.jpg"))).toBe(true);

    // Managed media directory was moved
    expect(fs.existsSync(path.join(tmpDir, "media", "gal-1"))).toBe(false);

    // Gallery deleted from DB
    const gal = db.prepare("SELECT * FROM galleries WHERE id = ?").get("gal-1");
    expect(gal).toBeUndefined();

    // Other galleries intact
    expect(fs.existsSync(path.join(tmpDir, "media", "gal-2"))).toBe(true);
    expect(db.prepare("SELECT * FROM galleries WHERE id = ?").get("gal-2")).toBeDefined();
  });

  it("crée un job completed si le nettoyage immédiat réussit", () => {
    deleteGalleryAndQuarantine("gal-1");

    const job = db.prepare(
      "SELECT status, error_message, relative_quarantine_path FROM gallery_deletion_jobs WHERE gallery_id = ?"
    ).get("gal-1") as { status: string; error_message: string | null; relative_quarantine_path: string };
    expect(job).toBeDefined();
    expect(job.status).toBe("completed");
    expect(job.relative_quarantine_path).toBeDefined();
    // Path is relative to GALLERY_MEDIA_PATH, not cwd
    expect(path.isAbsolute(job.relative_quarantine_path)).toBe(false);
  });

  it("crée un job pending si le nettoyage immédiat échoue", () => {
    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = true;

    deleteGalleryAndQuarantine("gal-1");

    const job = db.prepare(
      "SELECT status, error_message, attempt_count FROM gallery_deletion_jobs WHERE gallery_id = ?"
    ).get("gal-1") as { status: string; error_message: string | null; attempt_count: number };
    expect(job).toBeDefined();
    expect(job.status).toBe("pending");
    expect(job.attempt_count).toBe(1);
    // Error message must be a safe code, not a raw fs error
    expect(job.error_message).toBe("CLEANUP_FAILED");
  });

  it("le worker reprend et termine un job pending", () => {
    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = true;
    deleteGalleryAndQuarantine("gal-1");

    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = false;
    processGalleryDeletions();

    const job = db.prepare(
      "SELECT status, error_message, worker_id, lease_expires_at FROM gallery_deletion_jobs WHERE gallery_id = ?"
    ).get("gal-1") as { status: string; error_message: string | null; worker_id: string | null; lease_expires_at: number | null };
    expect(job.status).toBe("completed");
    expect(job.error_message).toBeNull();
    // Worker ID and lease cleared on terminal state
    expect(job.worker_id).toBeNull();
    expect(job.lease_expires_at).toBeNull();
  });

  it("une erreur SQL restaure les fichiers média", () => {
    const originalPrepare = db.prepare.bind(db);
    vi.spyOn(db, "prepare").mockImplementation((sql: string) => {
      if (sql.includes("DELETE FROM galleries")) {
        return { run: () => { throw new Error("SQL mock error"); } } as unknown as import("node:sqlite").StatementSync;
      }
      return originalPrepare(sql);
    });

    expect(() => deleteGalleryAndQuarantine("gal-1")).toThrow(/SQL_TRANSACTION_FAILED/);

    // DB not modified
    expect(db.prepare("SELECT * FROM galleries WHERE id = ?").get("gal-1")).toBeDefined();

    // Media files restored from quarantine
    expect(fs.existsSync(path.join(tmpDir, "media", "gal-1"))).toBe(true);

    // No jobs created (rollback)
    const jobs = db.prepare("SELECT * FROM gallery_deletion_jobs").all();
    expect(jobs.length).toBe(0);
  });

  it("les liens symboliques sur le dossier média sont rejetés", () => {
    fs.rmSync(path.join(tmpDir, "media", "gal-1"), { recursive: true });
    const fakeDir = path.join(tmpDir, "fake-symlink-target");
    fs.mkdirSync(fakeDir);
    fs.symlinkSync(fakeDir, path.join(tmpDir, "media", "gal-1"), "dir");

    expect(() => deleteGalleryAndQuarantine("gal-1")).toThrow("Media directory cannot be a symbolic link");
    expect(db.prepare("SELECT * FROM galleries WHERE id = ?").get("gal-1")).toBeDefined();
  });

  it("un fichier ordinaire à la place du dossier média est rejeté", () => {
    fs.rmSync(path.join(tmpDir, "media", "gal-1"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "media", "gal-1"), "not a directory");

    expect(() => deleteGalleryAndQuarantine("gal-1")).toThrow("Media path is not a directory");
    expect(db.prepare("SELECT * FROM galleries WHERE id = ?").get("gal-1")).toBeDefined();
  });

  it("un chemin de galerie sortant de la racine est rejeté", () => {
    const badId = "../etc/passwd";
    expect(() => deleteGalleryAndQuarantine(badId)).toThrow("Invalid gallery ID");
  });

  it("une galerie inexistante retourne Gallery not found", () => {
    expect(() => deleteGalleryAndQuarantine("nonexistent")).toThrow("Gallery not found");
  });

  it("le chemin relatif stocké ne contient pas de chemin absolu", () => {
    deleteGalleryAndQuarantine("gal-1");

    const job = db.prepare(
      "SELECT relative_quarantine_path FROM gallery_deletion_jobs WHERE gallery_id = ?"
    ).get("gal-1") as { relative_quarantine_path: string };
    expect(path.isAbsolute(job.relative_quarantine_path)).toBe(false);
    expect(job.relative_quarantine_path).not.toContain(tmpDir);
  });

  it("aucune erreur brute ou chemin absolu dans error_message", () => {
    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = true;
    deleteGalleryAndQuarantine("gal-1");

    const job = db.prepare(
      "SELECT error_message FROM gallery_deletion_jobs WHERE gallery_id = ?"
    ).get("gal-1") as { error_message: string | null };
    if (job.error_message) {
      expect(job.error_message).not.toContain("/");
      expect(job.error_message).not.toContain("\\");
      expect(job.error_message).not.toContain("EPERM");
      expect(path.isAbsolute(job.error_message)).toBe(false);
    }
  });
});

describe("Gallery Deletion Worker", () => {
  it("les jobs arrivés au maximum d'essais passent en failed", () => {
    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = true;
    deleteGalleryAndQuarantine("gal-1");

    // Manually set attempt_count to MAX-1 so next worker run makes it MAX
    db.prepare("UPDATE gallery_deletion_jobs SET attempt_count = 4 WHERE gallery_id = ?").run("gal-1");

    processGalleryDeletions();

    const job = db.prepare(
      "SELECT status, worker_id, lease_expires_at FROM gallery_deletion_jobs WHERE gallery_id = ?"
    ).get("gal-1") as { status: string; worker_id: string | null; lease_expires_at: number | null };
    expect(job.status).toBe("failed");
    expect(job.worker_id).toBeNull();
    expect(job.lease_expires_at).toBeNull();
  });

  it("une lease expirée est reprise par le worker", () => {
    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = true;
    deleteGalleryAndQuarantine("gal-1");

    // Simulate a stale processing job with expired lease
    db.prepare(
      "UPDATE gallery_deletion_jobs SET status = 'processing', lease_expires_at = ?, worker_id = 'old-worker' WHERE gallery_id = ?"
    ).run(Date.now() - 10000, "gal-1");

    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = false;
    processGalleryDeletions();

    const job = db.prepare(
      "SELECT status FROM gallery_deletion_jobs WHERE gallery_id = ?"
    ).get("gal-1") as { status: string };
    expect(job.status).toBe("completed");
  });

  it("un job failed peut être relancé manuellement", () => {
    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = true;
    deleteGalleryAndQuarantine("gal-1");

    // Force to failed
    db.prepare(
      "UPDATE gallery_deletion_jobs SET status = 'failed', attempt_count = 5 WHERE gallery_id = ?"
    ).run("gal-1");

    const jobBefore = db.prepare(
      "SELECT id, status FROM gallery_deletion_jobs WHERE gallery_id = ?"
    ).get("gal-1") as { id: string; status: string };
    expect(jobBefore.status).toBe("failed");

    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = false;
    retryFailedJob(jobBefore.id);

    const jobAfter = db.prepare(
      "SELECT status, attempt_count FROM gallery_deletion_jobs WHERE gallery_id = ?"
    ).get("gal-1") as { status: string; attempt_count: number };
    expect(jobAfter.status).toBe("pending");
    expect(jobAfter.attempt_count).toBe(0);
  });

  it("un lien symbolique à la place de la quarantaine est rejeté par le worker", () => {
    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = true;
    deleteGalleryAndQuarantine("gal-1");

    const job = db.prepare(
      "SELECT id, relative_quarantine_path FROM gallery_deletion_jobs WHERE gallery_id = ?"
    ).get("gal-1") as { id: string; relative_quarantine_path: string };

    const trashBase = path.join(tmpDir, "media", ".trash", "gallery-deletions");
    const quarantineDir = path.resolve(trashBase, job.relative_quarantine_path.replace(/^\.trash\/gallery-deletions\//, ""));

    // Replace quarantine with symlink
    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = false;
    fs.rmSync(quarantineDir, { recursive: true, force: true });
    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = true;
    const fakeTarget = path.join(tmpDir, "fake-target");
    fs.mkdirSync(fakeTarget);
    fs.symlinkSync(fakeTarget, quarantineDir, "dir");

    (globalThis as unknown as { mockRmSyncThrow: boolean }).mockRmSyncThrow = false;
    processGalleryDeletions();

    const jobAfter = db.prepare(
      "SELECT status, error_message FROM gallery_deletion_jobs WHERE gallery_id = ?"
    ).get("gal-1") as { status: string; error_message: string | null };
    // Should not be completed - symlink was rejected
    expect(jobAfter.status).not.toBe("completed");
    if (jobAfter.error_message) {
      expect(jobAfter.error_message).not.toContain("/");
    }
  });
});

describe("Gallery DB Migration V8", () => {
  it("migration V8 is idempotent", () => {
    // DB is already at V8 from beforeEach
    const version = db.prepare("SELECT MAX(version) as v FROM gallery_migrations").get() as { v: number };
    expect(version.v).toBe(8);

    // Re-open should not fail or add duplicate
    closeGalleryDb();
    const dbPath = path.join(tmpDir, "gallery.sqlite");
    const db2 = openGalleryDb(dbPath);
    const version2 = db2.prepare("SELECT MAX(version) as v FROM gallery_migrations").get() as { v: number };
    expect(version2.v).toBe(8);

    // gallery_deletion_jobs table exists
    const tables = db2.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='gallery_deletion_jobs'"
    ).get() as { name: string } | undefined;
    expect(tables).toBeDefined();
    expect(tables?.name).toBe("gallery_deletion_jobs");
    db2.close();
  });
});

describe("Gallery Compensations & Bulk", () => {
  it("échec de renameSync avec EXDEV lance CROSS_DEVICE_MOVE", () => {
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
      const err = new Error("EXDEV: cross-device link not permitted");
      (err as Error & { code: string }).code = "EXDEV";
      throw err;
    });

    try {
      expect(() => {
        deleteGalleryAndQuarantine("gal-1");
      }).toThrow(/CROSS_DEVICE_MOVE/);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("échec de BEGIN après déplacement lance SQL_TRANSACTION_FAILED et restaure", () => {
    vi.spyOn(db, "exec").mockImplementation((sql: string) => {
      if (sql.includes("BEGIN EXCLUSIVE TRANSACTION")) {
        throw new Error("BEGIN failed");
      }
    });

    expect(() => {
      deleteGalleryAndQuarantine("gal-1");
    }).toThrow(/SQL_TRANSACTION_FAILED/);

    // Media must be restored
    const baseMedia = path.resolve(ENV.GALLERY_MEDIA_PATH);
    const mediaDir = path.resolve(baseMedia, "gal-1");
    expect(fs.existsSync(mediaDir)).toBe(true);
    vi.restoreAllMocks();
  });

  it("échec de ROLLBACK avec restauration malgré tout", () => {
    const originalPrepare = DatabaseSync.prototype.prepare;
    vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (this: DatabaseSync, sql: string) {
      if (sql.includes("DELETE FROM galleries")) {
        return { run: () => { throw new Error("SQL error"); } } as unknown as ReturnType<typeof DatabaseSync.prototype.prepare>;
      }
      return originalPrepare.call(this, sql);
    });
    vi.spyOn(db, "exec").mockImplementation((sql: string) => {
      if (sql.includes("ROLLBACK")) {
        throw new Error("ROLLBACK failed too");
      }
      if (sql.includes("BEGIN") || sql.includes("COMMIT")) return;
    });

    expect(() => {
      deleteGalleryAndQuarantine("gal-1");
    }).toThrow(/SQL_TRANSACTION_FAILED/);

    const baseMedia = path.resolve(ENV.GALLERY_MEDIA_PATH);
    const mediaDir = path.resolve(baseMedia, "gal-1");
    expect(fs.existsSync(mediaDir)).toBe(true);
    vi.restoreAllMocks();
  });

  it("parent .trash symbolique est rejeté", () => {
    const baseMedia = path.resolve(ENV.GALLERY_MEDIA_PATH);
    const trashBase = path.join(baseMedia, ".trash");
    fs.rmSync(trashBase, { recursive: true, force: true });
    
    const fakeTarget = path.join(os.tmpdir(), "fake-trash");
    if (!fs.existsSync(fakeTarget)) fs.mkdirSync(fakeTarget);
    fs.symlinkSync(fakeTarget, trashBase, "dir");

    expect(() => {
      deleteGalleryAndQuarantine("gal-1");
    }).toThrow(/Quarantine base is not a valid directory/);
    
    fs.rmSync(trashBase, { force: true });
  });

  it("dossier média remplacé par un fichier est rejeté", () => {
    const baseMedia = path.resolve(ENV.GALLERY_MEDIA_PATH);
    const mediaDir = path.resolve(baseMedia, "gal-1");
    fs.rmSync(mediaDir, { recursive: true, force: true });
    fs.writeFileSync(mediaDir, "fake file");

    expect(() => {
      deleteGalleryAndQuarantine("gal-1");
    }).toThrow(/Media path is not a directory/);
  });

  it("dossier source d'import toujours intact", () => {
    deleteGalleriesAndQuarantineBulk(["gal-1"]);
    const importDir = path.join(path.dirname(ENV.GALLERY_MEDIA_PATH), "imports", "import-folder-1");
    expect(fs.existsSync(importDir)).toBe(true);
    expect(fs.existsSync(path.join(importDir, "original.jpg"))).toBe(true);
  });

  it("suppression groupée où la deuxième échoue restaure la première", () => {
    const originalPrepare = DatabaseSync.prototype.prepare;
    vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (this: DatabaseSync, sql: string) {
      if (sql.includes("DELETE FROM galleries")) {
        return {
          run: (id: string) => {
            if (id === "gal-2") throw new Error("Mock SQL error gal-2");
            originalPrepare.call(this, sql).run(id);
          }
        } as unknown as ReturnType<typeof DatabaseSync.prototype.prepare>;
      }
      return originalPrepare.call(this, sql);
    });

    expect(() => {
      deleteGalleriesAndQuarantineBulk(["gal-1", "gal-2"]);
    }).toThrow(/SQL_TRANSACTION_FAILED/);

    // Verify gal-1 is still there
    const baseMedia = path.resolve(ENV.GALLERY_MEDIA_PATH);
    const mediaDir1 = path.resolve(baseMedia, "gal-1");
    expect(fs.existsSync(mediaDir1)).toBe(true);
    
    // DB rollback verify
    const gal1 = db.prepare("SELECT * FROM galleries WHERE id = 'gal-1'").get();
    expect(gal1).toBeDefined();

    vi.restoreAllMocks();
  });
});
