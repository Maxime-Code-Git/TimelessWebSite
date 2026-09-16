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
  const PORT = 43213;
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
    // Valid 1x1 JPEG base64
    const validJpeg = require("node:buffer").Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
    fs.writeFileSync(path.join(importPath, "invites", "photos", "test.jpg"), validJpeg);

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
          ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=19456,t=2,p=1$xDSx00u+uSs9AcMqypmthw$ubmjWhg1XWL+Yp496qb5LLlTx0FK4lwqy9pvKa5ills",
          ADMIN_SESSION_SECRET: "12345678901234567890123456789012",
          GALLERY_SESSION_SECRET: "01234567890123456789012345678901",
          GALLERY_JWT_SECRET: "01234567890123456789012345678901"
        },
      });

      let started = false;
      serverProcess.stdout?.on("data", (d) => {
        console.log("Server stdout:", d.toString());
        if (!started && d.toString().includes(String(PORT))) {
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
    const getRes = await fetch(`${BASE_URL}/admin`, { redirect: "manual" });
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
        "x-forwarded-for": "127.0.0.1"
      },
      redirect: "manual",
    });
    expect(loginRes.status).toBe(302);
    const authCookie = loginRes.headers.get("Set-Cookie") || "";
    const loginLoc = loginRes.headers.get("Location") || "";
    console.log("authCookie:", authCookie);
    console.log("loginLoc:", loginLoc);

    // 3. Get /admin/galleries/new for new CSRF
    console.log("fetching newRes");
    const newRes = await fetch(`${BASE_URL}/admin/galleries/new`, {
      headers: { "Cookie": authCookie },
      redirect: "manual",
    });
    console.log("newRes status:", newRes.status);
    const newText = await newRes.text();
    const newCsrfToken = newText.match(/name="csrfToken" value="([^"]+)"/)?.[1] || "";

    console.log("fetching createRes");
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
    
    console.log("createRes status:", createRes.status);
    expect(createRes.status).toBe(302);
    const location = createRes.headers.get("Location");
    expect(location).toContain("/admin/galleries/");
    const galleryId = location?.split("/").pop();
    expect(galleryId).toBeTruthy();

    console.log("fetching updateRes");
    const updateRes = await fetch(`${BASE_URL}/admin/galleries/${galleryId}`, {
      method: "POST",
      body: new URLSearchParams({
        intent: "update_info",
        status: "published",
        bride_names: "Marie & Paul",
        csrfToken: newCsrfToken,
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": authCookie,
        "x-forwarded-for": "127.0.0.1",
      },
      redirect: "manual",
    });
    console.log("updateRes status:", updateRes.status);
    const updateText = await updateRes.text();
    // Use regex to find the actionData in Remix context
    console.log("actionData match:", updateText.match(/"error":"([^"]+)"/));
    expect(updateRes.status).toBe(400);

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
      },
      redirect: "manual",
    });
    const importJson = await importRes.json();
    expect(importRes.status).toBe(200);
    expect(importJson.status).toBe("pending");

    // 7. Wait for import worker
    let imported = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const statusRes = await fetch(`${BASE_URL}/api/admin/gallery-import/${galleryId}`, {
        headers: { "Cookie": authCookie },
        redirect: "manual",
      });
      const statusJson = await statusRes.json();
      if (statusJson.importState?.status === "completed") {
        console.log("Import completed result_json:", statusJson.importState.result_json);
        imported = true;
        break;
      }
    }
    expect(imported).toBe(true);

    // Get the imported media ID for the cover image
    const pageRes = await fetch(`${BASE_URL}/admin/galleries/${galleryId}`, { headers: { Cookie: authCookie } });
    const pageHtml = await pageRes.text();
    const mediaIdMatch = pageHtml.match(/name="cover_image_id" value="([a-f0-9\-]{36})"/);
    const cover_image_id = mediaIdMatch ? mediaIdMatch[1] : "";

    // 8. Publish successfully
    const pubRes = await fetch(`${BASE_URL}/admin/galleries/${galleryId}?_data=routes/admin.galleries.$id`, {
      method: "POST",
      body: new URLSearchParams({
        intent: "update_info",
        csrfToken: newCsrfToken,
        bride_names: "Alice & Bob",
        wedding_date: "2027-01-01",
        status: "published",
        expires_at: "2030-01-01",
        cover_image_id
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": authCookie,
        "x-forwarded-for": "127.0.0.1",
      },
      redirect: "manual",
    });
    const pubText = await pubRes.text();
    console.log("pubRes status:", pubRes.status);
    console.log("pubText snippet:", pubText.substring(0, 500));
    expect(pubRes.status).toBe(200);
    expect(pubText).toContain("success");

    const { execSync } = require("node:child_process");
    const public_id = execSync(`sqlite3 ${galleryDbPath} "SELECT public_id FROM galleries WHERE id = '${galleryId}'"`).toString().trim();
    
    // Rotate guest code to a known value
    const guest_code = "myGuestCode123";
    await fetch(`${BASE_URL}/admin/galleries/${galleryId}?_data=routes/admin.galleries.$id`, {
      method: "POST",
      body: new URLSearchParams({
        intent: "rotate_guest_code",
        csrfToken: newCsrfToken,
        guestCode: guest_code
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": authCookie,
        "x-forwarded-for": "127.0.0.1",
      },
      redirect: "manual"
    });

    // First GET to obtain guest CSRF and session cookie
    const guestPageRes = await fetch(`${BASE_URL}/fr/espace-clients`);
    const guestSessionCookie = guestPageRes.headers.get("Set-Cookie");
    const guestPageHtml = await guestPageRes.text();
    const guestCsrfMatch = guestPageHtml.match(/name="csrf"\s+value="([^"]+)"/);
    const guestCsrfToken = guestCsrfMatch ? guestCsrfMatch[1] : "";

    const guestLoginRes = await fetch(`${BASE_URL}/fr/espace-clients?_data=routes/fr.clients`, {
      method: "POST",
      body: new URLSearchParams({
        code: guest_code,
        csrf: guestCsrfToken
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": guestSessionCookie || "",
        "x-forwarded-for": "127.0.0.1"
      },
      redirect: "manual"
    });
    
    // Check if login redirects to the gallery
    expect([302, 303]).toContain(guestLoginRes.status);
    
    const guestCookie = guestLoginRes.headers.get("Set-Cookie");
    expect(guestCookie).toBeTruthy();

    const guestRes = await fetch(`${BASE_URL}/fr/galerie/${public_id}`, {
      headers: { "Cookie": guestCookie! }
    });
    expect(guestRes.status).toBe(200);
    // 10. Verify couple access and ZIP download
    const couple_code = "myCoupleCode456";
    await fetch(`${BASE_URL}/admin/galleries/${galleryId}?_data=routes/admin.galleries.$id`, {
      method: "POST",
      body: new URLSearchParams({
        intent: "rotate_couple_code",
        csrfToken: newCsrfToken,
        coupleCode: couple_code
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": authCookie,
        "x-forwarded-for": "127.0.0.1",
      },
      redirect: "manual"
    });

    const coupleLoginRes = await fetch(`${BASE_URL}/fr/espace-clients?_data=routes/fr.clients`, {
      method: "POST",
      body: new URLSearchParams({
        code: couple_code,
        csrf: guestCsrfToken // we can reuse the CSRF token from earlier GET
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": guestSessionCookie || "",
        "x-forwarded-for": "127.0.0.1"
      },
      redirect: "manual"
    });
    
    expect([302, 303]).toContain(coupleLoginRes.status);
    const coupleCookie = coupleLoginRes.headers.get("Set-Cookie");
    
    // Verify ZIP download API works for couples
    const zipRes = await fetch(`${BASE_URL}/api/gallery/${public_id}/download?type=all`, {
      headers: { "Cookie": coupleCookie! }
    });
    // It might return a redirect or a ZIP stream depending on the implementation
    expect([200, 302, 303]).toContain(zipRes.status);

    // 11. Verify Expiration
    // Expire the gallery by updating the expiration date to the past in DB
    execSync(`sqlite3 ${galleryDbPath} "UPDATE galleries SET expires_at = ${Date.now() - 86400000} WHERE id = '${galleryId}'"`);

    // Try logging in again as guest, should fail
    const expiredLoginRes = await fetch(`${BASE_URL}/fr/espace-clients?_data=routes/fr.clients`, {
      method: "POST",
      body: new URLSearchParams({
        code: guest_code,
        csrf: guestCsrfToken
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": guestSessionCookie || "",
        "x-forwarded-for": "127.0.0.1"
      },
      redirect: "manual"
    });
    
    // Should be unauthorized
    expect(expiredLoginRes.status).toBe(401);
  }, 15000);
});
