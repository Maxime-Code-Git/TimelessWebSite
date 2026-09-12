import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { action as adminHomeAction } from "../app/routes/admin.home";
import { loader as mediaLoader } from "../app/routes/media.home.$section.$imageId.$variant.$ext";
import { action as apiHomeImageAction } from "../app/routes/api.admin.home-image";
import defaultContent from "../app/content/default-site-content.json";

// Mock auth so we can test routes without authenticating
vi.mock("../app/lib/admin-auth.server.ts", () => ({
  requireValidAdminSession: () => ({ get: (key: string) => key === "csrfToken" ? "valid-token" : null })
}));

vi.mock("../app/lib/env.server.ts", () => ({
  env: {
    SMTP_HOST: "localhost",
    SMTP_PORT: "587",
    SMTP_USER: "user",
    SMTP_PASS: "pass",
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_SESSION_SECRET: "secret"
  },
  ENV: {
    SMTP_HOST: "localhost",
    SMTP_PORT: "587",
    SMTP_USER: "user",
    SMTP_PASS: "pass",
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_SESSION_SECRET: "secret",
    PUBLIC_SITE_URL: "http://localhost"
  },
  requireEnvVar: (_name: string) => "mocked"
}));

describe("admin-home-media integration", () => {
  let tempDir: string;
  let siteContentPath: string;
  let siteMediaPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-e2e-"));
    siteContentPath = path.join(tempDir, "site-content.json");
    siteMediaPath = path.join(tempDir, "site-media");

    fs.mkdirSync(siteMediaPath, { recursive: true });
    fs.writeFileSync(siteContentPath, JSON.stringify({
      schemaVersion: 2,
      revision: "a".repeat(32),
      updatedAt: new Date().toISOString(),
      business: defaultContent.business,
      pricing: defaultContent.pricing,
      home: defaultContent.home
    }), "utf-8");

    process.env.SITE_CONTENT_PATH = siteContentPath;
    process.env.SITE_MEDIA_PATH = siteMediaPath;
  });

  afterEach(() => {
    delete process.env.SITE_CONTENT_PATH;
    delete process.env.SITE_MEDIA_PATH;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Admin Home Form Routing", () => {
    it("GET is blocked for action", async () => {
      const req = new Request("http://localhost/admin/home", { method: "GET" });
      const response = await adminHomeAction({ request: req, params: {}, context: {}, url: new URL(req.url) } as never);
      expect(response.status).toBe(405);
    });

    it("Rejects POST if CSRF missing or incorrect", async () => {
      const req = new Request("http://localhost/admin/home", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "homeData={}"
      });
      // Origin header is missing so it will fail CSRF origin validation
      const response = await adminHomeAction({ request: req, params: {}, context: {}, url: new URL(req.url) } as never);
      expect(response.status).toBe(403);
    });

    it("Rejects very large payload for JSON to protect server", async () => {
      const largeData = "a".repeat(600 * 1024);
      const req = new Request("http://localhost/admin/home", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "origin": "http://localhost",
          "host": "localhost"
        },
        body: "homeData=" + largeData + "&csrfToken=valid-token&revision=" + "a".repeat(32)
      });
      const response = await adminHomeAction({ request: req, params: {}, context: {}, url: new URL(req.url) } as never);
      expect(response.status).toBe(413);
    });
  });

  describe("Media HTTP Routing", () => {
    it("blocks directory traversal in media loader", async () => {
      const req = new Request("http://localhost/media/home/hero/../../etc/passwd/960p/webp");
      const url = new URL(req.url);
      const response = await mediaLoader({
        request: req,
        params: { section: "hero", imageId: "../../etc/passwd", variant: "960p", ext: "webp" },
        context: {}, url, pattern: "" as never
      } as never);
      expect(response.status).toBe(404);
    });

    it("blocks invalid section in media loader", async () => {
      const req = new Request("http://localhost/media/home/invalid/12345678-1234-1234-1234-123456789012/960p/webp");
      const url = new URL(req.url);
      const response = await mediaLoader({
        request: req,
        params: { section: "invalid", imageId: "12345678-1234-1234-1234-123456789012", variant: "960p", ext: "webp" },
        context: {}, url, pattern: "" as never
      } as never);
      expect(response.status).toBe(404);
    });
  });

  describe("Image Upload Integration", () => {
    it("blocks uploads with missing files or headers", async () => {
      const formData = new FormData();
      const req = new Request("http://localhost/api/admin/home-image", {
        method: "POST",
        headers: {
          "origin": "http://localhost",
          "host": "localhost",
          "x-csrf-token": "valid-token"
        },
        body: formData
      });
      const response = await apiHomeImageAction({ request: req, params: {}, context: {}, url: new URL(req.url) } as never);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });
});
