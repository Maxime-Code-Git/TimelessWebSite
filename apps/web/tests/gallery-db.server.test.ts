import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

vi.mock("../app/lib/env.server", () => ({
  ENV: {
    GALLERY_DB_PATH: "/tmp/test-gallery.db",
    GALLERY_SECRET: "a".repeat(64),
    GALLERY_IMPORT_PATH: "/tmp/test-import",
    GALLERY_MEDIA_PATH: "/tmp/test-media",
    PUBLIC_SITE_URL: "http://localhost:5173",
    TRUST_PROXY: false,
  }
}));

describe("gallery-db migrations", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-test-"));
    dbPath = path.join(tmpDir, "test.db");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("should create a fresh V4 database with all tables", async () => {
    const { openGalleryDb } = await import("../app/lib/gallery-db.server");
    const db = openGalleryDb(dbPath);

    const version = db.prepare("SELECT MAX(version) as v FROM gallery_migrations").get() as { v: number };
    expect(version.v).toBe(6);

    // Verify tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain("galleries");
    expect(names).toContain("gallery_media");
    expect(names).toContain("gallery_imports");
    expect(names).toContain("gallery_codes");
    expect(names).toContain("gallery_migrations");

    // Verify gallery_codes has UNIQUE(gallery_id, level)
    const indexes = db.prepare("PRAGMA index_list(gallery_codes)").all() as { name: string; unique: number }[];
    const uniqueIndexes = indexes.filter(i => i.unique === 1);
    expect(uniqueIndexes.length).toBeGreaterThanOrEqual(1);

    db.close();
  });

  it("should migrate V1 -> V4 with existing galleries", async () => {
    // Manually create a V1 database
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(`
      CREATE TABLE gallery_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
      CREATE TABLE galleries (
        id TEXT PRIMARY KEY,
        public_id TEXT NOT NULL UNIQUE,
        bride_names TEXT NOT NULL,
        wedding_date TEXT NOT NULL,
        location TEXT,
        intro_fr TEXT, intro_en TEXT,
        signature_fr TEXT, signature_en TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
        guest_code_hash TEXT NOT NULL,
        couple_code_hash TEXT NOT NULL,
        guest_code_encrypted TEXT NOT NULL,
        couple_code_encrypted TEXT NOT NULL,
        guest_code_version INTEGER NOT NULL DEFAULT 1,
        couple_code_version INTEGER NOT NULL DEFAULT 1,
        cover_image_id TEXT,
        import_path TEXT
      );
      CREATE TABLE gallery_media (
        id TEXT PRIMARY KEY,
        gallery_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('photo', 'video')),
        visibility TEXT NOT NULL CHECK (visibility IN ('invites', 'maries')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        hash TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE
      );
      CREATE TABLE gallery_imports (
        id TEXT PRIMARY KEY,
        gallery_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        progress INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        result_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE
      );
    `);

    // Insert a gallery
    db.prepare(`
      INSERT INTO galleries (id, public_id, bride_names, wedding_date, created_at, expires_at, status, guest_code_hash, couple_code_hash, guest_code_encrypted, couple_code_encrypted)
      VALUES ('g1', 'pub1', 'Alice & Bob', '2026-06-15', 1000, 9999999999999, 'draft', 'hash_guest_1', 'hash_couple_1', 'enc_guest_1', 'enc_couple_1')
    `).run();

    db.prepare("INSERT INTO gallery_migrations (version, applied_at) VALUES (1, ?)").run(Date.now());
    db.close();

    // Now open with openGalleryDb which should run V2, V3, V4
    const { openGalleryDb } = await import("../app/lib/gallery-db.server");
    const db2 = openGalleryDb(dbPath);

    const version = db2.prepare("SELECT MAX(version) as v FROM gallery_migrations").get() as { v: number };
    expect(version.v).toBe(6);

    // Verify codes were migrated
    const codes = db2.prepare("SELECT * FROM gallery_codes WHERE gallery_id = 'g1'").all() as { code_hash: string; level: string; version: number }[];
    expect(codes).toHaveLength(2);
    const levels = codes.map(c => c.level).sort();
    expect(levels).toEqual(["invites", "maries"]);

    const guestCode = codes.find(c => c.level === "invites");
    expect(guestCode?.code_hash).toBe("hash_guest_1");
    expect(guestCode?.version).toBe(1);

    const coupleCode = codes.find(c => c.level === "maries");
    expect(coupleCode?.code_hash).toBe("hash_couple_1");
    expect(coupleCode?.version).toBe(1);

    db2.close();
  });

  it("should migrate V2 -> V4 with existing gallery_codes", async () => {
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(`
      CREATE TABLE gallery_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
      CREATE TABLE galleries (
        id TEXT PRIMARY KEY, public_id TEXT NOT NULL UNIQUE,
        bride_names TEXT NOT NULL, wedding_date TEXT NOT NULL, location TEXT,
        intro_fr TEXT, intro_en TEXT, signature_fr TEXT, signature_en TEXT,
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
        guest_code_hash TEXT NOT NULL, couple_code_hash TEXT NOT NULL,
        guest_code_encrypted TEXT NOT NULL, couple_code_encrypted TEXT NOT NULL,
        guest_code_version INTEGER NOT NULL DEFAULT 1, couple_code_version INTEGER NOT NULL DEFAULT 1,
        cover_image_id TEXT, import_path TEXT
      );
      CREATE TABLE gallery_media (id TEXT PRIMARY KEY, gallery_id TEXT NOT NULL, type TEXT NOT NULL, visibility TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, hash TEXT NOT NULL, width INTEGER, height INTEGER, created_at INTEGER NOT NULL, FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE);
      CREATE TABLE gallery_imports (id TEXT PRIMARY KEY, gallery_id TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, result_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE);
      CREATE TABLE gallery_codes (code_hash TEXT PRIMARY KEY, gallery_id TEXT NOT NULL, level TEXT NOT NULL, version INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE);
    `);

    db.prepare(`INSERT INTO galleries (id, public_id, bride_names, wedding_date, created_at, expires_at, status, guest_code_hash, couple_code_hash, guest_code_encrypted, couple_code_encrypted) VALUES ('g1', 'pub1', 'C & D', '2026-08-20', 1000, 9999999999999, 'draft', 'h_g1', 'h_c1', 'e_g1', 'e_c1')`).run();
    db.prepare("INSERT INTO gallery_codes (code_hash, gallery_id, level, version, created_at) VALUES ('h_g1', 'g1', 'invites', 1, 1000)").run();
    db.prepare("INSERT INTO gallery_codes (code_hash, gallery_id, level, version, created_at) VALUES ('h_c1', 'g1', 'maries', 1, 1000)").run();
    db.prepare("INSERT INTO gallery_migrations (version, applied_at) VALUES (1, ?)").run(Date.now());
    db.prepare("INSERT INTO gallery_migrations (version, applied_at) VALUES (2, ?)").run(Date.now());
    db.close();

    const { openGalleryDb } = await import("../app/lib/gallery-db.server");
    const db2 = openGalleryDb(dbPath);

    const version = db2.prepare("SELECT MAX(version) as v FROM gallery_migrations").get() as { v: number };
    expect(version.v).toBe(6);

    const codes = db2.prepare("SELECT * FROM gallery_codes WHERE gallery_id = 'g1'").all() as { code_hash: string; level: string }[];
    expect(codes).toHaveLength(2);
    expect(codes.map(c => c.level).sort()).toEqual(["invites", "maries"]);

    db2.close();
  });

  it("should migrate V3 -> V4 preserving existing data", async () => {
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(`
      CREATE TABLE gallery_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
      CREATE TABLE galleries (
        id TEXT PRIMARY KEY, public_id TEXT NOT NULL UNIQUE,
        bride_names TEXT NOT NULL, wedding_date TEXT NOT NULL, location TEXT,
        intro_fr TEXT, intro_en TEXT, signature_fr TEXT, signature_en TEXT,
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
        guest_code_hash TEXT NOT NULL, couple_code_hash TEXT NOT NULL,
        guest_code_encrypted TEXT NOT NULL, couple_code_encrypted TEXT NOT NULL,
        guest_code_version INTEGER NOT NULL DEFAULT 1, couple_code_version INTEGER NOT NULL DEFAULT 1,
        cover_image_id TEXT, import_path TEXT
      );
      CREATE TABLE gallery_media (id TEXT PRIMARY KEY, gallery_id TEXT NOT NULL, type TEXT NOT NULL, visibility TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, hash TEXT NOT NULL, width INTEGER, height INTEGER, created_at INTEGER NOT NULL, FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE);
      CREATE TABLE gallery_imports (id TEXT PRIMARY KEY, gallery_id TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, result_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE);
      CREATE TABLE gallery_codes (
        code_hash TEXT PRIMARY KEY, gallery_id TEXT NOT NULL, level TEXT NOT NULL CHECK (level IN ('invites', 'maries')),
        version INTEGER NOT NULL, created_at INTEGER NOT NULL, UNIQUE(gallery_id, level),
        FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE
      );
    `);

    db.prepare(`INSERT INTO galleries (id, public_id, bride_names, wedding_date, created_at, expires_at, status, guest_code_hash, couple_code_hash, guest_code_encrypted, couple_code_encrypted, guest_code_version, couple_code_version) VALUES ('g1', 'pub1', 'E & F', '2026-09-01', 1000, 9999999999999, 'published', 'h_g1v3', 'h_c1v3', 'e_g1', 'e_c1', 3, 2)`).run();
    db.prepare("INSERT INTO gallery_codes (code_hash, gallery_id, level, version, created_at) VALUES ('h_g1v3', 'g1', 'invites', 3, 1000)").run();
    db.prepare("INSERT INTO gallery_codes (code_hash, gallery_id, level, version, created_at) VALUES ('h_c1v3', 'g1', 'maries', 2, 1000)").run();
    db.prepare("INSERT INTO gallery_migrations (version, applied_at) VALUES (1, ?)").run(Date.now());
    db.prepare("INSERT INTO gallery_migrations (version, applied_at) VALUES (2, ?)").run(Date.now());
    db.prepare("INSERT INTO gallery_migrations (version, applied_at) VALUES (3, ?)").run(Date.now());
    db.close();

    const { openGalleryDb } = await import("../app/lib/gallery-db.server");
    const db2 = openGalleryDb(dbPath);

    const version = db2.prepare("SELECT MAX(version) as v FROM gallery_migrations").get() as { v: number };
    expect(version.v).toBe(6);

    // Versions should be preserved from galleries table
    const codes = db2.prepare("SELECT * FROM gallery_codes WHERE gallery_id = 'g1' ORDER BY level").all() as { code_hash: string; level: string; version: number }[];
    expect(codes).toHaveLength(2);
    const guest = codes.find(c => c.level === "invites")!;
    const couple = codes.find(c => c.level === "maries")!;
    expect(guest.version).toBe(3);
    expect(couple.version).toBe(2);

    db2.close();
  });

  it("should rollback V4 on hash collision between galleries", async () => {
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(`
      CREATE TABLE gallery_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
      CREATE TABLE galleries (
        id TEXT PRIMARY KEY, public_id TEXT NOT NULL UNIQUE,
        bride_names TEXT NOT NULL, wedding_date TEXT NOT NULL, location TEXT,
        intro_fr TEXT, intro_en TEXT, signature_fr TEXT, signature_en TEXT,
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
        guest_code_hash TEXT NOT NULL, couple_code_hash TEXT NOT NULL,
        guest_code_encrypted TEXT NOT NULL, couple_code_encrypted TEXT NOT NULL,
        guest_code_version INTEGER NOT NULL DEFAULT 1, couple_code_version INTEGER NOT NULL DEFAULT 1,
        cover_image_id TEXT, import_path TEXT
      );
      CREATE TABLE gallery_media (id TEXT PRIMARY KEY, gallery_id TEXT NOT NULL, type TEXT NOT NULL, visibility TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, hash TEXT NOT NULL, width INTEGER, height INTEGER, created_at INTEGER NOT NULL, FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE);
      CREATE TABLE gallery_imports (id TEXT PRIMARY KEY, gallery_id TEXT NOT NULL, status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, result_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE);
    `);

    // Two galleries sharing a hash — collision!
    db.prepare(`INSERT INTO galleries (id, public_id, bride_names, wedding_date, created_at, expires_at, status, guest_code_hash, couple_code_hash, guest_code_encrypted, couple_code_encrypted) VALUES ('g1', 'pub1', 'A & B', '2026-06-15', 1000, 9999999999999, 'draft', 'SHARED_HASH', 'h_c1', 'e1', 'e2')`).run();
    db.prepare(`INSERT INTO galleries (id, public_id, bride_names, wedding_date, created_at, expires_at, status, guest_code_hash, couple_code_hash, guest_code_encrypted, couple_code_encrypted) VALUES ('g2', 'pub2', 'C & D', '2026-07-15', 1000, 9999999999999, 'draft', 'SHARED_HASH', 'h_c2', 'e3', 'e4')`).run();

    db.prepare("INSERT INTO gallery_migrations (version, applied_at) VALUES (1, ?)").run(Date.now());
    db.close();

    const { openGalleryDb } = await import("../app/lib/gallery-db.server");
    expect(() => openGalleryDb(dbPath)).toThrow("collision");
  });

  it("should reject database file that is a symlink", async () => {
    const realDbPath = path.join(tmpDir, "real.db");
    const symlinkPath = path.join(tmpDir, "symlink.db");
    fs.writeFileSync(realDbPath, "");
    fs.symlinkSync(realDbPath, symlinkPath);

    const { openGalleryDb } = await import("../app/lib/gallery-db.server");
    expect(() => openGalleryDb(symlinkPath)).toThrow("symbolic link");
  });
});
