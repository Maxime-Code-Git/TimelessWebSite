import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import sharp from "sharp";
import { openGalleryDb, closeGalleryDb } from "../app/lib/gallery-db.server";
import { createGallery } from "../app/lib/gallery.server";
import { action, loader } from "../app/routes/api.admin.gallery-upload.$id";
import * as sessionServer from "../app/lib/session.server";
import { ENV } from "../app/lib/env.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

describe("Gallery Upload HTTP API (api.admin.gallery-upload.$id.ts)", () => {
  let tmpDir: string;
  let importBase: string;
  let mediaBase: string;
  let dbPath: string;
  let galleryId: string;
  const validCsrf = "csrf-token-123456";
  let cookieHeader: string;

  beforeEach(async () => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gallery-upload-http-test-")));
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

    // Create authenticated admin session with CSRF token
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

  describe("Authentication and Security Checks", () => {
    it("should reject requests without valid admin session", async () => {
      const request = new Request("https://example.com/api/admin/gallery-upload/" + galleryId, {
        method: "POST",
        headers: {
          "Origin": "https://example.com",
          "X-CSRF-Token": validCsrf,
        },
      });

      try {
        await action({ request, params: { id: galleryId }, context: {} } as unknown as ActionFunctionArgs);
        expect.unreachable("Should have thrown redirect");
      } catch (err: unknown) {
        expect((err as Response).status).toBe(302);
        expect((err as Response).headers.get("Location")).toBe("/admin");
      }
    });

    it("should reject POST requests with invalid Origin", async () => {
      const request = new Request("https://example.com/api/admin/gallery-upload/" + galleryId, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader,
          "Origin": "https://attacker.com",
          "X-CSRF-Token": validCsrf,
        },
      });

      const response = await action({ request, params: { id: galleryId }, context: {} } as unknown as ActionFunctionArgs);
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain("Forbidden");
    });

    it("should reject POST requests with missing or invalid CSRF token", async () => {
      const request = new Request("https://example.com/api/admin/gallery-upload/" + galleryId, {
        method: "POST",
        headers: {
          "Cookie": cookieHeader,
          "Origin": "https://example.com",
          "X-CSRF-Token": "wrong-csrf-token",
        },
      });

      const response = await action({ request, params: { id: galleryId }, context: {} } as unknown as ActionFunctionArgs);
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain("CSRF");
    });

    it("should reject malicious gallery IDs with path traversal", async () => {
      const request = new Request("https://example.com/api/admin/gallery-upload/..", {
        method: "POST",
        headers: {
          "Cookie": cookieHeader,
          "Origin": "https://example.com",
          "X-CSRF-Token": validCsrf,
        },
      });

      const response = await action({ request, params: { id: ".." }, context: {} } as unknown as ActionFunctionArgs);
      expect(response.status).toBe(400);
    });

    it("should reject init request with unknown destination", async () => {
      const request = new Request("https://example.com/api/admin/gallery-upload/" + galleryId + "?action=init", {
        method: "POST",
        headers: {
          "Cookie": cookieHeader,
          "Origin": "https://example.com",
          "X-CSRF-Token": validCsrf,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "init",
          destination: "unknown_dest",
          fileName: "invalid.jpg",
          fileSize: 1000,
          totalChunks: 1,
        }),
      });

      const response = await action({ request, params: { id: galleryId }, context: {} } as unknown as ActionFunctionArgs);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Destination d'upload invalide");
    });

    it("should reject init request with invalid or negative fileSize", async () => {
      const request = new Request("https://example.com/api/admin/gallery-upload/" + galleryId + "?action=init", {
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
          fileName: "invalid.jpg",
          fileSize: -50,
          totalChunks: 1,
        }),
      });

      const response = await action({ request, params: { id: galleryId }, context: {} } as unknown as ActionFunctionArgs);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Taille de fichier invalide");
    });

    it("should reject chunk request with non-integer chunk index header", async () => {
      const request = new Request("https://example.com/api/admin/gallery-upload/" + galleryId + "?action=chunk", {
        method: "POST",
        headers: {
          "Cookie": cookieHeader,
          "Origin": "https://example.com",
          "X-CSRF-Token": validCsrf,
          "Content-Type": "application/octet-stream",
          "X-Upload-Id": "12345678-1234-1234-1234-123456789abc",
          "X-Chunk-Index": "abc",
        },
        body: Buffer.from("data"),
      });

      const response = await action({ request, params: { id: galleryId }, context: {} } as unknown as ActionFunctionArgs);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Index de morceau");
    });
  });

  describe("End-to-End HTTP Upload Lifecycle", () => {
    it("should successfully execute init -> chunk -> finalize flow over HTTP for guest_photos", async () => {
      const jpegBuf = await sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 100, g: 150, b: 200 } } }).jpeg().toBuffer();

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
          fileName: "http-test.jpg",
          fileSize: jpegBuf.length,
          totalChunks: 1,
        }),
      });

      const initRes = await action({ request: initReq, params: { id: galleryId }, context: {} } as unknown as ActionFunctionArgs);
      expect(initRes.status).toBe(200);
      const initData = await initRes.json();
      expect(initData.uploadId).toBeDefined();
      expect(initData.destination).toBe("guest_photos");
      const uploadId = initData.uploadId as string;

      // 2. Chunk upload
      const chunkReq = new Request("https://example.com/api/admin/gallery-upload/" + galleryId + "?action=chunk", {
        method: "POST",
        headers: {
          "Cookie": cookieHeader,
          "Origin": "https://example.com",
          "X-CSRF-Token": validCsrf,
          "Content-Type": "application/octet-stream",
          "X-Upload-Id": uploadId,
          "X-Chunk-Index": "0",
          "X-Total-Chunks": "1",
        },
        body: jpegBuf,
      });

      const chunkRes = await action({ request: chunkReq, params: { id: galleryId }, context: {} } as unknown as ActionFunctionArgs);
      expect(chunkRes.status).toBe(200);
      const chunkData = await chunkRes.json();
      expect(chunkData.success).toBe(true);

      // 3. Query status via loader
      const statusReq = new Request("https://example.com/api/admin/gallery-upload/" + galleryId + "?action=status&uploadId=" + uploadId, {
        headers: { "Cookie": cookieHeader },
      });
      const statusRes = await loader({ request: statusReq, params: { id: galleryId }, context: {} } as unknown as LoaderFunctionArgs);
      expect(statusRes.status).toBe(200);
      const statusData = await statusRes.json();
      expect(statusData.uploadedChunks).toEqual([0]);

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
      expect(finRes.status).toBe(200);
      const finData = await finRes.json();
      expect(finData.success).toBe(true);
      expect(finData.fileName).toBe("http-test.jpg");

      // Verify Cache-Control header
      expect(finRes.headers.get("Cache-Control")).toContain("no-store");
    });
  });
});
