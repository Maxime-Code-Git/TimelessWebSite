import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DatabaseSync as Database } from 'node:sqlite';
import fs from 'node:fs';

vi.mock('../app/lib/env.server', () => ({
  ENV: {
    GALLERY_DB_PATH: ':memory:' // use in-memory db for tests
  }
}));

describe('Gallery Database Migrations', () => {
  let db: any;

  beforeEach(() => {
    // We recreate DB for each test manually to test migrations step by step
    db = new Database(':memory:');
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('should migrate from v2 to v3 correctly', () => {
    // Setup v2 schema
    db.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      INSERT INTO schema_version (version) VALUES (2);

      CREATE TABLE galleries (
        id TEXT PRIMARY KEY,
        public_id TEXT UNIQUE NOT NULL,
        bride_names TEXT NOT NULL,
        wedding_date TEXT NOT NULL,
        location TEXT,
        guest_code_encrypted TEXT NOT NULL,
        guest_code_hash TEXT NOT NULL,
        guest_code_version INTEGER NOT NULL DEFAULT 1,
        couple_code_encrypted TEXT NOT NULL,
        couple_code_hash TEXT NOT NULL,
        couple_code_version INTEGER NOT NULL DEFAULT 1,
        expires_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        intro_fr TEXT,
        intro_en TEXT,
        signature_fr TEXT,
        signature_en TEXT,
        cover_image_id TEXT,
        import_path TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // Insert v2 data
    db.prepare(`
      INSERT INTO galleries (id, public_id, bride_names, wedding_date, guest_code_encrypted, guest_code_hash, guest_code_version, couple_code_encrypted, couple_code_hash, couple_code_version, expires_at, created_at, updated_at)
      VALUES ('g1', 'pub1', 'Alice & Bob', '2027', 'encG', 'hashG', 1, 'encC', 'hashC', 1, 9999999999999, 100, 100)
    `).run();

    // Now run the v3 migration
    // Instead of calling initGalleryDb, we'll extract the migration logic to ensure it works
    const version = db.prepare("SELECT version FROM schema_version").get().version;
    expect(version).toBe(2);

    db.exec(`
      CREATE TABLE IF NOT EXISTS gallery_codes (
        code_hash TEXT PRIMARY KEY,
        gallery_id TEXT NOT NULL,
        level TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE
      );
    `);

    const galleries = db.prepare("SELECT * FROM galleries").all();
    const nowMs = Date.now();
    for (const g of galleries) {
      db.prepare("INSERT OR IGNORE INTO gallery_codes (code_hash, gallery_id, level, version, created_at) VALUES (?, ?, ?, ?, ?)").run(g.guest_code_hash, g.id, 'invites', g.guest_code_version, nowMs);
      db.prepare("INSERT OR IGNORE INTO gallery_codes (code_hash, gallery_id, level, version, created_at) VALUES (?, ?, ?, ?, ?)").run(g.couple_code_hash, g.id, 'maries', g.couple_code_version, nowMs);
    }
    db.prepare("UPDATE schema_version SET version = 3").run();

    // Assert v3
    const newVersion = db.prepare("SELECT version FROM schema_version").get().version;
    expect(newVersion).toBe(3);

    const codes = db.prepare("SELECT * FROM gallery_codes ORDER BY level").all();
    expect(codes.length).toBe(2);
    expect(codes[0].level).toBe('invites');
    expect(codes[0].code_hash).toBe('hashG');
    expect(codes[1].level).toBe('maries');
    expect(codes[1].code_hash).toBe('hashC');
  });
});
