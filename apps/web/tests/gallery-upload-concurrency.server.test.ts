import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import sharp from "sharp";
import crypto from "node:crypto";
import { openGalleryDb, closeGalleryDb } from "../app/lib/gallery-db.server";
import { createGallery } from "../app/lib/gallery.server";
import { action, loader } from "../app/routes/api.admin.gallery-upload.$id";
import * as sessionServer from "../app/lib/session.server";
import { ENV } from "../app/lib/env.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

describe("Reproduction: 6 valid JPEGs > CHUNK_SIZE with concurrency 2", () => {
  let tmpDir: string;
  let importBase: string;
  let mediaBase: string;
  let dbPath: string;
  let galleryId: string;
  const validCsrf = "csrf-token-123456";
  let cookieHeader: string;

  beforeEach(async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "repro-test-")));
    importBase = path.join(tmpDir, "imports");
    mediaBase = path.join(tmpDir, "media");
    dbPath = path.join(tmpDir, "gallery.db");

    fs.mkdirSync(importBase, { recursive: true, mode: 0o700 });
    fs.mkdirSync(mediaBase, { recursive: true, mode: 0o700 });

    vi.spyOn(ENV, "GALLERY_DB_PATH", "get").mockReturnValue(dbPath);
    vi.spyOn(ENV, "GALLERY_IMPORT_PATH", "get").mockReturnValue(importBase);
    vi.spyOn(ENV, "GALLERY_MEDIA_PATH", "get").mockReturnValue(mediaBase);
    vi.spyOn(ENV, "PUBLIC_SITE_URL", "get").mockReturnValue("https://example.com");
    vi.spyOn(ENV, "ADMIN_SESSION_SECRET", "get").mockReturnValue("test-session-secret-must-be-32-chars-long");
    vi.spyOn(ENV, "ADMIN_PASSWORD_HASH", "get").mockReturnValue("$argon2id$v=19$m=19456,t=2,p=1$abc$def");

    openGalleryDb(dbPath);

    const gal = createGallery({
      bride_names: "Alice & Bob",
      wedding_date: "2026-09-20",
    });
    galleryId = gal.id;

    const { computeCredentialVersion } = await import("../app/lib/auth.server");
    const session = await sessionServer.getSession();
    session.set("adminId", "123");
    session.set("credentialVersion", computeCredentialVersion());
    session.set("csrfToken", validCsrf);
    cookieHeader = await sessionServer.commitSession(session);
  });

  afterEach(() => {
    closeGalleryDb();
    vi.restoreAllMocks();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should process 6 valid JPEGs > CHUNK_SIZE with concurrency 2", async () => {
    const CHUNK_SIZE = 5 * 1024 * 1024;
    const files: { name: string; buffer: Buffer; size: number; totalChunks: number }[] = [];

    console.log("Generating 6 JPEGs of ~7-10MB...");
    for (let i = 0; i < 6; i++) {
      const raw = crypto.randomBytes(3000 * 2400 * 3);
      const buf = await sharp(raw, { raw: { width: 3000, height: 2400, channels: 3 } })
        .jpeg({ quality: 90 })
        .toBuffer();
      files.push({
        name: `photo_${i}.jpg`,
        buffer: buf,
        size: buf.length,
        totalChunks: Math.ceil(buf.length / CHUNK_SIZE),
      });
      console.log(`File ${i}: size=${(buf.length / 1024 / 1024).toFixed(2)} MB, chunks=${files[i].totalChunks}`);
    }

    const pool = [...files];
    const CONCURRENCY = 2;
    const failures: { name: string; phase: string; error: string }[] = [];

    const uploadSingle = async (file: typeof files[0]) => {
      // 1. Init
      const initReq = new Request("https://example.com/api/admin/gallery-upload/" + galleryId + "?action=init", {
        method: "POST",
        headers: {
          "Cookie": cookieHeader,
          "Origin": "https://example.com",
          "X-CSRF-Token": validCsrf,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "init",
          destination: "guest_photos",
          fileName: file.name,
          fileSize: file.size,
          totalChunks: file.totalChunks,
          chunkSize: CHUNK_SIZE,
        }),
      });

      const initRes = await action({ request: initReq, params: { id: galleryId }, context: {} } as unknown as ActionFunctionArgs);
      if (initRes.status !== 200) {
        const err = await initRes.json();
        failures.push({ name: file.name, phase: "init", error: `HTTP ${initRes.status}: ${JSON.stringify(err)}` });
        return;
      }
      const initData = await initRes.json();
      const uploadId = initData.uploadId;

      // 2. Chunks
      for (let c = 0; c < file.totalChunks; c++) {
        const start = c * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBuf = file.buffer.subarray(start, end);

        const chunkReq = new Request("https://example.com/api/admin/gallery-upload/" + galleryId + "?action=chunk", {
          method: "POST",
          headers: {
            "Cookie": cookieHeader,
            "Origin": "https://example.com",
            "X-CSRF-Token": validCsrf,
            "Content-Type": "application/octet-stream",
            "X-Upload-Id": uploadId,
            "X-Chunk-Index": String(c),
            "X-Total-Chunks": String(file.totalChunks),
          },
          body: new Uint8Array(chunkBuf),
        });

        const chunkRes = await action({ request: chunkReq, params: { id: galleryId }, context: {} } as unknown as ActionFunctionArgs);
        if (chunkRes.status !== 200) {
          const err = await chunkRes.json();
          failures.push({ name: file.name, phase: `chunk_${c}`, error: `HTTP ${chunkRes.status}: ${JSON.stringify(err)}` });
          return;
        }
      }

      // 3. Status
      const statusReq = new Request("https://example.com/api/admin/gallery-upload/" + galleryId + "?action=status&uploadId=" + uploadId, {
        headers: { "Cookie": cookieHeader },
      });
      const statusRes = await loader({ request: statusReq, params: { id: galleryId }, context: {} } as unknown as LoaderFunctionArgs);
      if (statusRes.status !== 200) {
        const err = await statusRes.json();
        failures.push({ name: file.name, phase: "status", error: `HTTP ${statusRes.status}: ${JSON.stringify(err)}` });
        return;
      }

      // 4. Finalize
      const finReq = new Request("https://example.com/api/admin/gallery-upload/" + galleryId + "?action=finalize", {
        method: "POST",
        headers: {
          "Cookie": cookieHeader,
          "Origin": "https://example.com",
          "X-CSRF-Token": validCsrf,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "finalize",
          uploadId,
        }),
      });

      const finRes = await action({ request: finReq, params: { id: galleryId }, context: {} } as unknown as ActionFunctionArgs);
      if (finRes.status !== 200) {
        const err = await finRes.json();
        failures.push({ name: file.name, phase: "finalize", error: `HTTP ${finRes.status}: ${JSON.stringify(err)}` });
        return;
      }
    };

    const runNext = async () => {
      while (pool.length > 0) {
        const file = pool.shift();
        if (file) {
          await uploadSingle(file);
        }
      }
    };

    const runners: Promise<void>[] = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      runners.push(runNext());
    }
    await Promise.all(runners);

    console.log("REPRODUCTION FAILURES:", failures);
    expect(failures).toEqual([]);
  }, 60000);
});
