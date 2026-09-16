import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";

const requireModule = createRequire(import.meta.url);
const servePkgPath = requireModule.resolve("@react-router/serve/package.json");
const serveBin = path.join(path.dirname(servePkgPath), "bin.cjs");

async function stopServer(proc: ChildProcess | undefined) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  return new Promise<void>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGKILL");
        resolve();
      }
    }, 2000);
    proc.once("close", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve();
      }
    });
    proc.kill("SIGTERM");
  });
}

describe("Admin Gallery E2E Lifecycle", () => {
  let serverProcess: ChildProcess;
  const PORT = 43212;
  const BASE_URL = `http://localhost:${PORT}`;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-gallery-e2e-"));
  const dbPath = path.join(tempDir, "rate-limit.db");
  const galleryDbPath = path.join(tempDir, "gallery.db");
  const siteContentPath = path.join(tempDir, "site-content.json");
  const defaultContentPath = path.resolve(__dirname, "../app/content/default-site-content.json");
  const mediaPath = path.join(tempDir, "media");
  const importPath = path.join(tempDir, "imports", "mock-wedding");

  beforeAll(async () => {
    fs.copyFileSync(defaultContentPath, siteContentPath);
    fs.mkdirSync(mediaPath, { recursive: true });
    
    // Create a mock import folder structure
    fs.mkdirSync(path.join(importPath, "invites", "photos"), { recursive: true });
    fs.writeFileSync(path.join(importPath, "invites", "photos", "test.jpg"), "mock-jpeg-data");

    return new Promise((resolve, reject) => {
      serverProcess = spawn(process.execPath, [serveBin, "./build/server/index.js"], {
        cwd: path.resolve(__dirname, ".."),
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: String(PORT),
          NODE_ENV: "production",
          PUBLIC_SITE_URL: BASE_URL,
          CONTACT_RATE_LIMIT_SECRET: "test-secret",
          RATE_LIMIT_DB_PATH: dbPath,
          BOOKING_DB_PATH: path.join(tempDir, "booking.db"),
          GALLERY_DB_PATH: galleryDbPath,
          GALLERY_MEDIA_PATH: mediaPath,
          GALLERY_IMPORT_PATH: path.join(tempDir, "imports"),
          SITE_CONTENT_PATH: siteContentPath,
          ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXlzYWx0$gq0y0JpZ5kI7lP8B/F5T4l7+xZ1X8Lp2N3o0C7+QYQk", // "test"
          ADMIN_SESSION_SECRET: "01234567890123456789012345678901",
          GALLERY_SESSION_SECRET: "01234567890123456789012345678901",
          GALLERY_JWT_SECRET: "01234567890123456789012345678901"
        },
      });

      let started = false;
      serverProcess.stdout?.on("data", (d) => {
        if (!started && d.toString().includes("is running")) {
          started = true;
          resolve(undefined);
        }
      });
      serverProcess.stderr?.on("data", (d) => {
        if (d.toString().includes("EADDRINUSE")) reject(new Error("PORT IN USE"));
      });
      setTimeout(() => {
        if (!started) reject(new Error("Timeout waiting for server to start"));
      }, 5000);
    });
  });

  afterAll(async () => {
    await stopServer(serverProcess);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should complete the full gallery lifecycle (create, constraints, import, publish)", async () => {
    // 1. Get anonymous CSRF
    const getRes = await fetch(`${BASE_URL}/admin`);
    const anonCookie = getRes.headers.get("Set-Cookie");
    const text = await getRes.text();
    const csrfMatch = text.match(/name="csrfToken" value="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : "";

    // 2. Login
    const loginRes = await fetch(`${BASE_URL}/admin`, {
      method: "POST",
      body: new URLSearchParams({ intent: "login", password: "test", csrfToken }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": anonCookie || "",
      },
      redirect: "manual",
    });
    expect(loginRes.status).toBe(302);
    const authCookie = loginRes.headers.get("Set-Cookie") || "";

    // 3. Get /admin/galleries/new for new CSRF
    const newRes = await fetch(`${BASE_URL}/admin/galleries/new`, {
      headers: { "Cookie": authCookie }
    });
    const newText = await newRes.text();
    const newCsrfToken = newText.match(/name="csrfToken" value="([^"]+)"/)?.[1] || "";

    // 4. Create Gallery
    const createRes = await fetch(`${BASE_URL}/admin/galleries/new`, {
      method: "POST",
      body: new URLSearchParams({
        csrfToken: newCsrfToken,
        bride_names: "Alice & Bob",
        wedding_date: "2027-01-01",
        expires_at: "2030-01-01",
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": authCookie,
      },
      redirect: "manual",
    });
    
    expect(createRes.status).toBe(302);
    const location = createRes.headers.get("Location");
    expect(location).toContain("/admin/galleries/");
    const galleryId = location?.split("/").pop();
    expect(galleryId).toBeTruthy();

    // 5. Try publishing an empty gallery (Constraint failure expected)
    const updateRes = await fetch(`${BASE_URL}/admin/galleries/${galleryId}`, {
      method: "POST",
      body: new URLSearchParams({
        intent: "update_info",
        csrfToken: newCsrfToken,
        bride_names: "Alice & Bob",
        wedding_date: "2027-01-01",
        status: "published",
        expires_at: "2030-01-01"
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": authCookie,
      },
    });
    const updateJson = await updateRes.json();
    expect(updateRes.status).toBe(400);
    expect(updateJson.error).toContain("sans média");

    // 6. Start import
    const importRes = await fetch(`${BASE_URL}/api/admin/gallery-import/${galleryId}`, {
      method: "POST",
      body: new URLSearchParams({
        csrfToken: newCsrfToken,
        folderName: "mock-wedding"
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": authCookie,
      }
    });
    const importJson = await importRes.json();
    expect(importRes.status).toBe(200);
    expect(importJson.status).toBe("pending");

    // 7. Wait for import worker
    let imported = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const statusRes = await fetch(`${BASE_URL}/api/admin/gallery-import/${galleryId}`, {
        headers: { "Cookie": authCookie }
      });
      const statusJson = await statusRes.json();
      if (statusJson.importState?.status === "completed") {
        imported = true;
        break;
      }
    }
    expect(imported).toBe(true);

    // 8. Publish successfully
    const pubRes = await fetch(`${BASE_URL}/admin/galleries/${galleryId}`, {
      method: "POST",
      body: new URLSearchParams({
        intent: "update_info",
        csrfToken: newCsrfToken,
        bride_names: "Alice & Bob",
        wedding_date: "2027-01-01",
        status: "published",
        expires_at: "2030-01-01"
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": authCookie,
      },
    });
    const pubJson = await pubRes.json();
    expect(pubRes.status).toBe(200);
    expect(pubJson.success).toBe(true);
  }, 15000);
});
