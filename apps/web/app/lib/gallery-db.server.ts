import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import { ENV } from "./env.server";

let singletonDb: DatabaseSync | undefined;

export function openGalleryDb(dbPath: string): DatabaseSync {
  const dir = path.dirname(dbPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const dirStat = fs.statSync(dir);
  if ((dirStat.mode & 0o777) !== 0o700) {
    fs.chmodSync(dir, 0o700);
  }

  if (fs.existsSync(dbPath)) {
    const stat = fs.lstatSync(dbPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`CRITICAL: dbPath cannot be a symbolic link.`);
    }
  }

  const db = new DatabaseSync(dbPath);

  const fileStat = fs.statSync(dbPath);
  if ((fileStat.mode & 0o777) !== 0o600) {
    fs.chmodSync(dbPath, 0o600);
  }

  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA journal_mode = WAL;");

  db.exec("BEGIN EXCLUSIVE TRANSACTION;");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS gallery_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);

    let currentVersion = 0;
    const versionRow = db.prepare("SELECT MAX(version) as v FROM gallery_migrations").get() as { v: number | null } | undefined;
    if (versionRow && versionRow.v !== null) {
      currentVersion = versionRow.v;
    }

    if (currentVersion < 1) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS galleries (
          id TEXT PRIMARY KEY,
          public_id TEXT NOT NULL UNIQUE,
          bride_names TEXT NOT NULL,
          wedding_date TEXT NOT NULL,
          location TEXT,
          intro_fr TEXT,
          intro_en TEXT,
          signature_fr TEXT,
          signature_en TEXT,
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

        CREATE TABLE IF NOT EXISTS gallery_media (
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

        CREATE TABLE IF NOT EXISTS gallery_imports (
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
      db.prepare("INSERT INTO gallery_migrations (version, applied_at) VALUES (1, ?)").run(Date.now());
      currentVersion = 1;
    }

    if (currentVersion < 2) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS gallery_codes (
          code_hash TEXT PRIMARY KEY,
          gallery_id TEXT NOT NULL,
          level TEXT NOT NULL CHECK (level IN ('invites', 'maries')),
          version INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE
        );
      `);

      // Migrate existing hashes to the gallery_codes table
      const galleries = db.prepare("SELECT id, guest_code_hash, guest_code_version, couple_code_hash, couple_code_version FROM galleries").all() as { id: string, guest_code_hash: string, guest_code_version: number, couple_code_hash: string, couple_code_version: number }[];

      const insertCode = db.prepare("INSERT OR IGNORE INTO gallery_codes (code_hash, gallery_id, level, version, created_at) VALUES (?, ?, ?, ?, ?)");
      const now = Date.now();
      for (const g of galleries) {
        insertCode.run(g.guest_code_hash, g.id, 'invites', g.guest_code_version, now);
        insertCode.run(g.couple_code_hash, g.id, 'maries', g.couple_code_version, now);
      }

      db.prepare("INSERT INTO gallery_migrations (version, applied_at) VALUES (2, ?)").run(Date.now());
      currentVersion = 2;
    }

    if (currentVersion < 3) {
      db.exec(`
        CREATE TABLE gallery_codes_v3 (
          code_hash TEXT PRIMARY KEY,
          gallery_id TEXT NOT NULL,
          level TEXT NOT NULL CHECK (level IN ('invites', 'maries')),
          version INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(gallery_id, level),
          FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE
        );
      `);

      const duplicates = db.prepare(`
        SELECT gallery_id, level, COUNT(*) as c FROM gallery_codes GROUP BY gallery_id, level HAVING c > 1
      `).all() as {gallery_id: string, level: string}[];

      if (duplicates.length > 0) {
        throw new Error("Migration failed: duplicate gallery_id and level in gallery_codes detected: " + JSON.stringify(duplicates));
      }

      db.exec(`
        INSERT INTO gallery_codes_v3 (code_hash, gallery_id, level, version, created_at)
        SELECT code_hash, gallery_id, level, version, created_at FROM gallery_codes;
        DROP TABLE gallery_codes;
        ALTER TABLE gallery_codes_v3 RENAME TO gallery_codes;
      `);

      db.prepare("INSERT INTO gallery_migrations (version, applied_at) VALUES (3, ?)").run(Date.now());
      currentVersion = 3;
    }

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return db;
}

export function getGalleryDb(): DatabaseSync {
  if (singletonDb) return singletonDb;
  singletonDb = openGalleryDb(ENV.GALLERY_DB_PATH);
  return singletonDb;
}

export function closeGalleryDb(): void {
  if (!singletonDb) return;
  singletonDb.close();
  singletonDb = undefined;
}
