import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import { getGalleryDb } from "~/lib/gallery-db.server";
import { ENV } from "~/lib/env.server";
import { startGalleryImport, processImport, acquireNextJob } from "~/lib/gallery-import.server";

// Mock fs to allow intercepting specific functions while keeping the rest intact
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    renameSync: vi.fn(actual.renameSync),
    createReadStream: vi.fn(actual.createReadStream),
  };
});

const WORKER_LEASE_MS = 30000;

describe("Gallery Import Worker Logic", () => {
  let db: DatabaseSync;
  const galleryId = "test-gallery";
  let importDir = "";

  beforeAll(async () => {
    importDir = path.join(ENV.GALLERY_IMPORT_PATH, "worker-test");
    fs.mkdirSync(path.join(importDir, "invites/photos"), { recursive: true });
    
    const dummyJpegPath1 = path.join(importDir, "invites/photos/test1.jpg");
    const dummyJpegPath2 = path.join(importDir, "invites/photos/test2.jpg");
    await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } } }).jpeg().toFile(dummyJpegPath1);
    await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } } }).jpeg().toFile(dummyJpegPath2);

    db = getGalleryDb();
    
    // Ensure gallery exists
    try {
      db.prepare(`INSERT INTO galleries (id, public_id, bride_names, wedding_date, created_at, expires_at, status, guest_code_hash, couple_code_hash, guest_code_encrypted, couple_code_encrypted) 
      VALUES (?, 'pub', 'A&B', '2026-01-01', ?, ?, 'draft', 'x', 'y', 'z', 'w')`).run(galleryId, Date.now(), Date.now() + 86400000);
    } catch { /* ignore */ }
  });

  afterEach(() => {
    db.prepare("DELETE FROM gallery_imports").run();
    db.prepare("DELETE FROM gallery_media").run();
    const mediaDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId);
    if (fs.existsSync(mediaDir)) {
      fs.rmSync(mediaDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("should prevent 2 workers from acquiring the same job concurrently", () => {
    startGalleryImport(galleryId, "worker-test");
    const job1 = acquireNextJob();
    expect(job1).toBeDefined();
    
    const job2 = acquireNextJob();
    expect(job2).toBeNull();
  });

  it("should allow stealing an expired lease", () => {
    const importId = startGalleryImport(galleryId, "worker-test");
    const job1 = acquireNextJob();
    expect(job1).toBeDefined();

    // simulate expired lease
    db.prepare("UPDATE gallery_imports SET lease_expires_at = ? WHERE id = ?").run(Date.now() - 1000, importId);

    const job2 = acquireNextJob();
    expect(job2).toBeDefined();
    expect(job2!.lease_token).not.toBe(job1!.lease_token);

    const row = db.prepare("SELECT attempt_count FROM gallery_imports WHERE id = ?").get(importId) as Record<string, unknown>;
    expect(row.attempt_count).toBe(2);
  });

  it("deux boucles du même processus ne traitent jamais le même job", () => {
    startGalleryImport(galleryId, "worker-test");
    const job1 = acquireNextJob();
    expect(job1).toBeDefined();

    // The second call in the same process should return null because the lease is active
    const job2 = acquireNextJob();
    expect(job2).toBeNull();
  });

  it("le heartbeat prolonge le bail", async () => {
    const importId = startGalleryImport(galleryId, "worker-test");
    const job = acquireNextJob();
    expect(job).toBeDefined();

    const before = db.prepare("SELECT lease_expires_at FROM gallery_imports WHERE id = ?").get(importId) as Record<string, unknown>;
    
    const originalPrepare = db.prepare.bind(db);
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO gallery_media")) {
        const stmt = originalPrepare(sql);
        return {
          run: async (...args: unknown[]) => {
            // Wait 16 seconds to allow heartbeat to trigger at 15s
            await new Promise(r => setTimeout(r, 16000));
            return stmt.run(...args);
          },
          get: stmt.get.bind(stmt),
          all: stmt.all.bind(stmt)
        } as unknown as ReturnType<typeof db.prepare>;
      }
      return originalPrepare(sql);
    });

    await processImport(importId, galleryId, "worker-test", job!.lease_token);

    const after = db.prepare("SELECT lease_expires_at FROM gallery_imports WHERE id = ?").get(importId) as Record<string, unknown>;
    expect(after.lease_expires_at as number).toBeGreaterThan(before.lease_expires_at as number);
  }, 25000);

  it("should stop processing if lease is lost (heartbeat cancel)", async () => {
    const importId = startGalleryImport(galleryId, "worker-test");
    const job = acquireNextJob();
    expect(job).toBeDefined();

    const promise = processImport(importId, galleryId, "worker-test", job!.lease_token);
    
    // steal lease
    db.prepare("UPDATE gallery_imports SET lease_expires_at = ?, worker_id = 'thief' WHERE id = ?").run(Date.now() + 10000, importId);
    
    await promise;

    const row = db.prepare("SELECT status FROM gallery_imports WHERE id = ?").get(importId) as Record<string, unknown>;
    expect(row.status).toBe("processing"); // it stopped before finalizing
  });

  it("un ancien propriétaire ne peut pas effectuer la réconciliation", async () => {
    const importId = startGalleryImport(galleryId, "worker-test");
    const job = acquireNextJob();
    expect(job).toBeDefined();

    // steal lease BEFORE processImport starts
    db.prepare("UPDATE gallery_imports SET lease_expires_at = ?, worker_id = 'thief' WHERE id = ?").run(Date.now() + 10000, importId);

    await processImport(importId, galleryId, "worker-test", job!.lease_token);
    
    const row = db.prepare("SELECT status, worker_id, result_json FROM gallery_imports WHERE id = ?").get(importId) as Record<string, unknown>;
    expect(row.status).toBe("processing");
    expect(row.worker_id).toBe("thief");
    expect(row.result_json).toBeNull();
  });

  it("échec du renommage : aucun enregistrement fantôme", async () => {
    const importId = startGalleryImport(galleryId, "worker-test");
    const job = acquireNextJob();
    expect(job).toBeDefined();

    vi.mocked(fs.renameSync).mockImplementationOnce(() => {
      throw new Error("Simulated rename error");
    });

    await processImport(importId, galleryId, "worker-test", job!.lease_token);

    const medias = db.prepare("SELECT * FROM gallery_media WHERE gallery_id = ?").all(galleryId) as Record<string, unknown>[];
    expect(medias.length).toBe(1); // One file succeeded, the other failed rename and was compensated

    const jobRow = db.prepare("SELECT result_json FROM gallery_imports WHERE id = ?").get(importId) as Record<string, unknown>;
    const res = JSON.parse(jobRow.result_json as string);
    expect(res.ignored[0].reason).toContain("Simulated rename error");
  });

  it("échec de l’insertion : aucun fichier final orphelin", async () => {
    const importId = startGalleryImport(galleryId, "worker-test");
    const job = acquireNextJob();
    expect(job).toBeDefined();

    const originalPrepare = db.prepare.bind(db);
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO gallery_media")) {
        return {
          run: () => { throw new Error("Simulated DB insert error"); },
          get: () => {},
          all: () => {}
        } as unknown as ReturnType<typeof db.prepare>;
      }
      return originalPrepare(sql);
    });

    await processImport(importId, galleryId, "worker-test", job!.lease_token);

    const mediaDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId);
    const files = fs.readdirSync(mediaDir);
    expect(files.filter(f => !f.endsWith(".tmp")).length).toBe(0); // No final files created
  });

  it("perte du bail pendant la copie", async () => {
    const importId = startGalleryImport(galleryId, "worker-test");
    const job = acquireNextJob();
    expect(job).toBeDefined();

    vi.mocked(fs.createReadStream).mockImplementationOnce((...args) => {
      // Steal lease right before reading starts
      db.prepare("UPDATE gallery_imports SET lease_expires_at = ?, worker_id = 'thief' WHERE id = ?").run(Date.now() + 10000, importId);
      const fsOriginal = vi.importActual("node:fs");
      return (fs as unknown as typeof fs).createReadStream(...args);
    });

    await processImport(importId, galleryId, "worker-test", job!.lease_token);

    const jobRow = db.prepare("SELECT result_json FROM gallery_imports WHERE id = ?").get(importId) as Record<string, unknown>;
    expect(jobRow.result_json as string).toBeNull(); // stopped before finalize
  });

  it("perte du bail après l’insertion et avant le renommage", async () => {
    const importId = startGalleryImport(galleryId, "worker-test");
    const job = acquireNextJob();
    expect(job).toBeDefined();

    vi.mocked(fs.renameSync).mockImplementationOnce(() => {
      // Steal lease right before renaming
      db.prepare("UPDATE gallery_imports SET lease_expires_at = ?, worker_id = 'thief' WHERE id = ?").run(Date.now() + 10000, importId);
      // Wait, processImport checks lease BEFORE renameSync.
      // So this intercept might not even trigger the failure if checkLease caught it before!
      // But if we steal it HERE, it's during rename. We just throw an error.
      throw new Error("Stolen lease");
    });

    await processImport(importId, galleryId, "worker-test", job!.lease_token);

    const jobRow = db.prepare("SELECT result_json FROM gallery_imports WHERE id = ?").get(importId) as Record<string, unknown>;
    expect(jobRow.result_json as string).toBeNull();
  });
});
