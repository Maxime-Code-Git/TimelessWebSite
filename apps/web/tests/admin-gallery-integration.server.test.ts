// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import AdmZip from "adm-zip";

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

describe("Admin Gallery Integration Lifecycle", () => {
  let serverProcess: ChildProcess;
  const PORT = Math.floor(Math.random() * 20000) + 40000;
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
    fs.mkdirSync(path.join(importPath, "invites", "videos"), { recursive: true });
    fs.mkdirSync(path.join(importPath, "maries", "photos"), { recursive: true });
    fs.mkdirSync(path.join(importPath, "maries", "videos"), { recursive: true });

    // Valid 1x1 JPEG base64
    const validJpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");

    // Valid 1x1 PNG base64
    const validPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

    fs.writeFileSync(path.join(importPath, "invites", "photos", "test.jpg"), validJpeg);
    fs.writeFileSync(path.join(importPath, "maries", "photos", "couple.png"), validPng);

    // Valid mp4 header: length (4 bytes), 'ftyp' (4 bytes), 'mp42' (4 bytes)
    const validMp4_1 = Buffer.concat([Buffer.from([0,0,0,0x18]), Buffer.from("ftypmp42"), Buffer.from("video1")]);
    const validMp4_2 = Buffer.concat([Buffer.from([0,0,0,0x18]), Buffer.from("ftypmp42"), Buffer.from("video2")]);

    fs.writeFileSync(path.join(importPath, "invites", "videos", "vid.mp4"), validMp4_1);
    fs.writeFileSync(path.join(importPath, "maries", "videos", "couple-vid.mp4"), validMp4_2);

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



    // 3. Get /admin/galleries/new for new CSRF
        const newRes = await fetch(`${BASE_URL}/admin/galleries/new`, {
      headers: { "Cookie": authCookie },
      redirect: "manual",
    });

    const newText = await newRes.text();
    const newCsrfToken = newText.match(/name="csrfToken" value="([^"]+)"/)?.[1] || "";

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
        // Use regex to find the actionData in Remix context
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
        imported = true;
        break;
      }
    }
    expect(imported).toBe(true);

    // Get the imported media ID for the cover image (specifically the maries photo)
    const mediaDb = new DatabaseSync(galleryDbPath);
    const mariesPhotoRow = mediaDb.prepare("SELECT id FROM gallery_media WHERE gallery_id = ? AND visibility = 'maries' AND type = 'photo'").get(galleryId!) as { id: string } | undefined;
    const mariesVideoRow = mediaDb.prepare("SELECT id FROM gallery_media WHERE gallery_id = ? AND visibility = 'maries' AND type = 'video'").get(galleryId!) as { id: string } | undefined;
    mediaDb.close();
    const cover_image_id = mariesPhotoRow?.id || "";
    const couple_video_id = mariesVideoRow?.id || "";

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
    expect(pubRes.status).toBe(200);
    expect(pubText).toContain("success");

    const publicIdDb = new DatabaseSync(galleryDbPath);
    const public_id = (publicIdDb.prepare("SELECT public_id FROM galleries WHERE id = ?").get(galleryId as string) as { public_id: string }).public_id;
    publicIdDb.close();

    // Verify Admin can load a thumbnail directly without a gallery session
    const adminThumbnailRes = await fetch(`${BASE_URL}/api/gallery/${public_id}/media/${cover_image_id}?variant=thumbnail`, {
      headers: { "Cookie": authCookie }
    });
    expect(adminThumbnailRes.status).toBe(200);

    // Verify Public session cannot bypass
    const publicThumbnailRes = await fetch(`${BASE_URL}/api/gallery/${public_id}/media/${cover_image_id}?variant=thumbnail`);
    expect(publicThumbnailRes.status).toBe(401);

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
    const guestHtml = await guestRes.text();
    // Verify guest doesn't see cover ID
    expect(guestHtml).not.toContain(cover_image_id);

    // Verify Guest API responses
    const guestZipPhotosRes = await fetch(`${BASE_URL}/api/gallery/${public_id}/download?type=photos`, { headers: { "Cookie": guestCookie! } });
    const guestZipVideosRes = await fetch(`${BASE_URL}/api/gallery/${public_id}/download?type=videos`, { headers: { "Cookie": guestCookie! } });
    const guestZipAllRes = await fetch(`${BASE_URL}/api/gallery/${public_id}/download?type=all`, { headers: { "Cookie": guestCookie! } });

    expect(guestZipPhotosRes.status).toBe(200);
    const photosBuf = Buffer.from(await guestZipPhotosRes.arrayBuffer());
    const photosZip = new AdmZip(photosBuf);
    const photosZipEntries = photosZip.getEntries().map(e => e.entryName);
    expect(photosZipEntries).toContain("Photos/test.jpg");
    expect(photosZipEntries).not.toContain("Photos/couple.png"); // maries photo shouldn't be there

    expect(guestZipVideosRes.status).toBe(200);
    const videosBuf = Buffer.from(await guestZipVideosRes.arrayBuffer());
    const videosZip = new AdmZip(videosBuf);
    const videosZipEntries = videosZip.getEntries().map(e => e.entryName);
    expect(videosZipEntries).toContain("Videos/vid.mp4");
    expect(videosZipEntries).not.toContain("Videos/couple-vid.mp4");

    expect(guestZipAllRes.status).toBe(200);
    const allBuf = Buffer.from(await guestZipAllRes.arrayBuffer());
    const allZip = new AdmZip(allBuf);
    const allZipEntries = allZip.getEntries().map(e => e.entryName);
    expect(allZipEntries).toContain("Photos/test.jpg");
    expect(allZipEntries).toContain("Videos/vid.mp4");
    expect(allZipEntries).not.toContain("Photos/couple.png");
    expect(allZipEntries).not.toContain("Videos/couple-vid.mp4");


    // Verify guest photos API pagination
    const guestPhotosApiRes = await fetch(`${BASE_URL}/api/gallery/${public_id}/photos`, { headers: { "Cookie": guestCookie! } });
    expect(guestPhotosApiRes.status).toBe(200);
    const guestPhotosJson = await guestPhotosApiRes.json();
    expect(guestPhotosJson.total).toBe(1); // Only 1 guest photo ("test.jpg")
    expect(guestPhotosJson.hasMore).toBe(false);
    expect(guestPhotosJson.photos.length).toBe(1);

    // Verify 404 for direct accesses
    const forbidPhotoRes = await fetch(`${BASE_URL}/api/gallery/${public_id}/media/${cover_image_id}`, { headers: { "Cookie": guestCookie! } });
    expect(forbidPhotoRes.status).toBe(404);
    const forbidVideoRes = await fetch(`${BASE_URL}/api/gallery/${public_id}/media/${couple_video_id}`, { headers: { "Cookie": guestCookie! } });
    expect(forbidVideoRes.status).toBe(404);
    const forbidDownloadRes = await fetch(`${BASE_URL}/api/gallery/${public_id}/download/original/${cover_image_id}`, { headers: { "Cookie": guestCookie! } });
    expect(forbidDownloadRes.status).toBe(404);
    const forbidDownloadVideoRes = await fetch(`${BASE_URL}/api/gallery/${public_id}/download/original/${couple_video_id}`, { headers: { "Cookie": guestCookie! } });
    expect(forbidDownloadVideoRes.status).toBe(404);
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
    const coupleZipRes = await fetch(`${BASE_URL}/api/gallery/${public_id}/download?type=all`, {
      headers: { "Cookie": coupleCookie! }
    });
    expect(coupleZipRes.status).toBe(200);
    expect(coupleZipRes.headers.get("Content-Type")).toBe("application/zip");

    const coupleAllBuf = Buffer.from(await coupleZipRes.arrayBuffer());
    const coupleAllZip = new AdmZip(coupleAllBuf);
    expect(coupleAllZip.getEntries().length).toBeGreaterThan(0);

    // 11. Verify Expiration
    // Expire the gallery by updating the expiration date to the past in DB

        const expireDb = new DatabaseSync(galleryDbPath);
    expireDb.prepare("UPDATE galleries SET expires_at = ? WHERE id = ?").run(Date.now() - 86400000, galleryId as string);
    expireDb.close();


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

    // 12. Test media deletion from admin
    const actionUrl = `${BASE_URL}/admin/galleries/${galleryId}?_data=routes/admin.galleries.$id`;

    // We already have `db` instantiated at top maybe? Or we can just get it.
    const db = new DatabaseSync(galleryDbPath);
    const initialPhotos = db.prepare("SELECT * FROM gallery_media WHERE gallery_id = ? AND type = 'photo'").all(galleryId as string) as { id: string }[];
    expect(initialPhotos.length).toBeGreaterThan(0);

    const mediaToDelete = initialPhotos[0];
    const mediaToKeep = initialPhotos.find(p => p.id !== mediaToDelete.id);

    // Set cover_image_id to mediaToDelete
    db.prepare("UPDATE galleries SET cover_image_id = ? WHERE id = ?").run(mediaToDelete.id, galleryId as string);

    const delFormData = new URLSearchParams();
    delFormData.append("csrfToken", newCsrfToken);
    delFormData.append("intent", "delete_media");
    delFormData.append("mediaIds", mediaToDelete.id);

    const delRes = await fetch(actionUrl, {
      method: "POST",
      body: delFormData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": authCookie,
        "x-forwarded-for": "127.0.0.1",
      }
    });

    await delRes.text();
    expect(delRes.status).toBe(200);

    const remaining = db.prepare("SELECT * FROM gallery_media WHERE gallery_id = ?").all(galleryId as string) as { id: string }[];
    expect(remaining.some(r => r.id === mediaToDelete.id)).toBe(false);

    const mediaDir = path.join(mediaPath, galleryId as string);
    expect(fs.existsSync(path.join(mediaDir, mediaToDelete.id))).toBe(false);

    if (mediaToKeep) {
      expect(remaining.some(r => r.id === mediaToKeep.id)).toBe(true);
      expect(fs.existsSync(path.join(mediaDir, mediaToKeep.id))).toBe(true);
    }

    const gal = db.prepare("SELECT cover_image_id, status FROM galleries WHERE id = ?").get(galleryId as string) as { cover_image_id: string | null, status: string };
    expect(gal.cover_image_id).toBeNull();

    const failData = new URLSearchParams();
    failData.append("csrfToken", newCsrfToken);
    failData.append("intent", "delete_media");
    failData.append("mediaIds", "unknown-id");

    const failRes = await fetch(actionUrl, {
      method: "POST",
      body: failData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": authCookie,
        "x-forwarded-for": "127.0.0.1",
      }
    });
    await failRes.text();
    expect(failRes.status).toBe(400);

    // Test deletion of media from another gallery
    const otherGalleryId = "other_gallery_for_test";
    db.prepare(`
      INSERT INTO galleries (
        id, public_id, bride_names, wedding_date, status, expires_at, created_at, 
        guest_code_hash, couple_code_hash, guest_code_encrypted, couple_code_encrypted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      otherGalleryId, "otherpub", "other", Date.now().toString(), "published", Date.now() + 100000, Date.now(),
      "hash1", "hash2", "enc1", "enc2"
    );
    const otherMediaId = "other_media_id_1";
    db.prepare(`
      INSERT INTO gallery_media (
        id, gallery_id, type, visibility, original_name, mime_type, size, hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      otherMediaId, otherGalleryId, "photo", "invites", "test.jpg", "image/jpeg", 100, "hash", Date.now()
    );
    const otherGalleryPath = path.join(mediaPath, otherGalleryId);
    fs.mkdirSync(otherGalleryPath, { recursive: true });
    fs.writeFileSync(path.join(otherGalleryPath, otherMediaId), "dummy_content");

    const otherData = new URLSearchParams();
    otherData.append("csrfToken", newCsrfToken);
    otherData.append("intent", "delete_media");
    otherData.append("mediaIds", otherMediaId);

    const otherRes = await fetch(actionUrl, {
      method: "POST",
      body: otherData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": authCookie,
        "x-forwarded-for": "127.0.0.1",
      }
    });
    expect(otherRes.status).toBe(400);
    const otherExists = db.prepare("SELECT 1 FROM gallery_media WHERE id = ?").get(otherMediaId);
    expect(otherExists).toBeDefined();
    expect(fs.existsSync(path.join(otherGalleryPath, otherMediaId))).toBe(true);

    // Test deletion when import is pending
    if (mediaToKeep) {
      db.prepare("INSERT INTO gallery_imports (id, gallery_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run("test_import", galleryId as string, "pending", Date.now(), Date.now());
      
      const pendingData = new URLSearchParams();
      pendingData.append("csrfToken", newCsrfToken);
      pendingData.append("intent", "delete_media");
      pendingData.append("mediaIds", mediaToKeep.id);
  
      const pendingRes = await fetch(actionUrl, {
        method: "POST",
        body: pendingData,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Origin": BASE_URL,
          "Cookie": authCookie,
          "x-forwarded-for": "127.0.0.1",
        }
      });
      expect(pendingRes.status).toBe(400);
      const pendingExists = db.prepare("SELECT 1 FROM gallery_media WHERE id = ?").get(mediaToKeep.id);
      expect(pendingExists).toBeDefined();
      expect(fs.existsSync(path.join(mediaDir, mediaToKeep.id))).toBe(true);
      
      db.prepare("DELETE FROM gallery_imports WHERE id = ?").run("test_import");

      // Test SQLite transaction rollback
      db.prepare("CREATE TRIGGER fail_delete BEFORE DELETE ON gallery_media BEGIN SELECT RAISE(ABORT, 'Simulated failure'); END;").run();
      try {
        const rollbackData = new URLSearchParams();
        rollbackData.append("csrfToken", newCsrfToken);
        rollbackData.append("intent", "delete_media");
        rollbackData.append("mediaIds", mediaToKeep.id);
  
        const rollbackRes = await fetch(actionUrl, {
          method: "POST",
          body: rollbackData,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": BASE_URL,
            "Cookie": authCookie,
            "x-forwarded-for": "127.0.0.1",
          }
        });
        expect(rollbackRes.status).toBe(500);
        const stillExists = db.prepare("SELECT 1 FROM gallery_media WHERE id = ?").get(mediaToKeep.id);
        expect(stillExists).toBeDefined();
        expect(fs.existsSync(path.join(mediaDir, mediaToKeep.id))).toBe(true);
      } finally {
        db.prepare("DROP TRIGGER fail_delete").run();
      }
    }

    // Empty the gallery to test auto-draft
    if (remaining.length > 0) {
      const allForm = new URLSearchParams();
      allForm.append("csrfToken", newCsrfToken);
      allForm.append("intent", "delete_media");
      for (const r of remaining) {
        allForm.append("mediaIds", r.id);
      }

      const resAll = await fetch(actionUrl, {
        method: "POST",
        body: allForm,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Origin": BASE_URL,
          "Cookie": authCookie,
          "x-forwarded-for": "127.0.0.1",
        }
      });
      await resAll.text();
      expect(resAll.status).toBe(200);

      const emptyGal = db.prepare("SELECT status FROM galleries WHERE id = ?").get(galleryId as string) as { status: string };
      expect(emptyGal.status).toBe("draft");
    }
    db.close();
  }, 15000);
});
