import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";


const fixtureDirectory = fileURLToPath(new URL(".", import.meta.url));

const IMPORT_FOLDER = "e2e-playwright-import";

test.describe("Client Gallery E2E — Full Cycle", () => {
  let targetDir: string;
  let galleryDbPath: string;

  test.beforeAll(async () => {
    galleryDbPath = process.env.GALLERY_DB_PATH!;
    if (!galleryDbPath) throw new Error("GALLERY_DB_PATH is required");

    const importBase = process.env.GALLERY_IMPORT_PATH || path.join(process.cwd(), "imports");
    targetDir = path.join(importBase, IMPORT_FOLDER);

    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    fs.mkdirSync(path.join(targetDir, "invites/photos"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "invites/videos"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "maries/photos"), { recursive: true });
    fs.mkdirSync(path.join(targetDir, "maries/videos"), { recursive: true });

    // Generate 25 distinct guest photos
    for (let i = 1; i <= 25; i++) {
      const p = path.join(targetDir, `invites/photos/guest-photo-${i}.jpg`);
      await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: i * 10, g: 100, b: 100 } } })
        .jpeg()
        .toFile(p);
    }
    // Generate 1 distinct couple photo
    const couplePhotoPath = path.join(targetDir, "maries/photos/couple-photo.jpg");
    await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .jpeg()
      .toFile(couplePhotoPath);

    // Generate 1 guest video (valid MP4)
    const guestVideoPath = path.join(targetDir, "invites/videos/guest-video.mp4");
    fs.copyFileSync(path.join(fixtureDirectory, "fixtures/vid1.mp4"), guestVideoPath);

    // Generate 1 couple video (valid MP4)
    const coupleVideoPath = path.join(targetDir, "maries/videos/couple-video.mp4");
    fs.copyFileSync(path.join(fixtureDirectory, "fixtures/vid2.mp4"), coupleVideoPath);
  });

  test("cycle complet des galeries clientes", async ({ browser }) => {
    test.setTimeout(120_000);
    // Contextes
    const adminContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const coupleContext = await browser.newContext();
    const oldGuestContext = await browser.newContext();

    const adminPage = await adminContext.newPage();
    const guestPage = await guestContext.newPage();
    const couplePage = await coupleContext.newPage();
    const oldGuestPage = await oldGuestContext.newPage();


    // 1. Connexion admin
    await adminPage.goto("/admin");
    await expect(
      adminPage.locator('input[name="password"]')
    ).toBeVisible();

    await adminPage.fill(
      'input[name="password"]',
      "e2e_password"
    );

    await adminPage.getByRole("button", {
      name: "Se connecter",
      exact: true,
    }).click();

    await expect(adminPage.locator("h1")).toHaveText(
      "Administration Sempra"
    );

    // 2. Création de galerie
    await adminPage.goto("/admin/galleries/new");
    await adminPage.fill('input[name="bride_names"]', "Playwright Couple");
    await adminPage.fill('input[name="wedding_date"]', "2027-07-15");
    await adminPage.fill('input[name="location"]', "Château");
    await adminPage.click('button[type="submit"]');

    await adminPage.waitForURL(/\/admin\/galleries\/.+/);
    const galleryId = adminPage.url().split("/admin/galleries/")[1];
    expect(galleryId).toBeTruthy();

    await adminPage.click("text=Afficher les codes");
    const guestCode = await adminPage.getByLabel("Code invités actuel").inputValue();
    const coupleCode = await adminPage.getByLabel("Code mariés actuel").inputValue();
    const originalGuestCode = guestCode;

    // 3. Refus publication sans média
    await adminPage.selectOption('select[name="status"]', "published");
    await adminPage.click('button:has-text("Enregistrer les informations")');
    await expect(
      adminPage.getByRole("alert")
    ).toContainText(
      "Une galerie ne peut pas être publiée sans média valide."
    );
    await adminPage.selectOption('select[name="status"]', "draft");

    // 4. Import des 28 médias
    await adminPage.getByLabel("Dossier d'import").selectOption(IMPORT_FOLDER);
    await expect(adminPage.getByText("28 médias trouvés", { exact: false })).toBeVisible();
    await expect(adminPage.getByText("Invités : 25 photos, 1 vidéos", { exact: false })).toBeVisible();
    await expect(adminPage.getByText("Mariés : 1 photos, 1 vidéos", { exact: false })).toBeVisible();

    const importResponsePromise = adminPage.waitForResponse(
      response =>
        response.url().includes(
          `/api/admin/gallery-import/${galleryId}`
        ) &&
        response.request().method() === "POST"
    );

    const dialogPromise = adminPage.waitForEvent("dialog");

    const importClickPromise = adminPage.getByRole("button", {
      name: "Confirmer et lancer l'import",
      exact: true,
    }).click();

    const dialog = await dialogPromise;
    await dialog.accept();
    await importClickPromise;

    const importResponse = await importResponsePromise;
    expect(importResponse.status()).toBe(200);

    const importResponseData = await importResponse.json() as {
      importId?: string;
      status?: string;
      error?: string;
    };

    expect(importResponseData.error).toBeUndefined();
    expect(importResponseData.importId).toEqual(expect.any(String));
    expect(importResponseData.status).toBe("pending");

    // 5. Attente de la fin réelle de l'import (polling state API)
    await expect(async () => {
      const res = await adminContext.request.get(
        `/api/admin/gallery-import/${galleryId}?poll=${Date.now()}`
      );
      expect(res.status()).toBe(200);
      const data = await res.json() as {
        importState: {
          status: string;
          progress: number;
          total: number;
          result_json: string | null;
        } | null;
      };

      const importState = data.importState;

      expect(importState).not.toBeNull();
      expect(importState!.status).toBe("completed");
      expect(importState!.progress).toBe(28);
      expect(importState!.total).toBe(28);
      expect(importState!.result_json).not.toBeNull();

      const result = JSON.parse(importState!.result_json!) as {
        imported: number;
        ignored: Array<{ file: string; reason: string }>;
      };

      expect(result.imported).toBe(28);
      expect(result.ignored).toHaveLength(0);
    }).toPass({
      timeout: 60_000,
      intervals: [500, 1_000, 2_000],
    });

    // Reload admin page to reflect imported media
    await adminPage.reload();

    // 6. Sélection d'une couverture avec locator accessible
    const coverRadio = adminPage
      .locator(
        'input[type="radio"][name="cover_image_id"]:not([value=""])'
      )
      .first();

    await coverRadio.check({ force: true });
    await expect(coverRadio).toBeChecked();

    // 7. Publication
    await adminPage.selectOption('select[name="status"]', "published");
    await adminPage.click('button:has-text("Enregistrer les informations")');
    await expect(
      adminPage.getByRole("status")
    ).toHaveText("Enregistré.");

    const db = new DatabaseSync(galleryDbPath);
    const galleryPublicId = (db.prepare("SELECT public_id FROM galleries WHERE id = ?").get(galleryId) as { public_id: string }).public_id;
    db.close();

    // 8. Connexion invités (old guest context as well)
    await guestPage.goto("/fr/espace-clients");
    await guestPage.fill('input[name="code"]', guestCode);
    await guestPage.click('button[type="submit"]');
    await guestPage.waitForURL(`/fr/galerie/${galleryPublicId}`);

    await oldGuestPage.goto("/fr/espace-clients");
    await oldGuestPage.fill('input[name="code"]', guestCode);
    await oldGuestPage.click('button[type="submit"]');
    await oldGuestPage.waitForURL(`/fr/galerie/${galleryPublicId}`);

    // 22-25. En-têtes de confidentialité (sur la page invité)
    const galleryRes = await guestContext.request.get(`/fr/galerie/${galleryPublicId}`);
    const headers = galleryRes.headers();
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["x-robots-tag"]).toContain("noindex");
    expect(headers["x-robots-tag"]).toContain("nofollow");
    expect(headers["referrer-policy"]).toContain("no-referrer");

    // 9. Présence des 24 premières photos de galerie (sans compter logo et couverture)
    // Logo is inside header, cover is probably in a banner. Photos are in gallery-photo
    await expect(guestPage.getByTestId('gallery-photo')).toHaveCount(24);

    // 10. Présence du bouton Voir plus
    const seeMoreBtn = guestPage.locator('button:has-text("Voir plus")');
    await expect(seeMoreBtn).toBeVisible();

    // 11. Clic et chargement de la 25e photo (24 + 1 vidéo + 1 photo = 26 items)
    await seeMoreBtn.click();
    await expect(guestPage.getByTestId('gallery-photo')).toHaveCount(25);

    // 12. Présence vidéo invité avec controls
    const guestVideo = guestPage.getByTestId('gallery-video').locator('video').first();
    await expect(guestPage.getByTestId('gallery-video')).toHaveCount(1);
    await expect(guestVideo).toHaveCount(1);
    await expect(guestVideo).toHaveAttribute("controls", "");

    // 13. Réponse 206 à Range valide sur vidéo
    const videoSrc = await guestVideo.locator("source").getAttribute("src");
    const rangeRes = await guestContext.request.get(videoSrc!, {
      headers: { Range: "bytes=0-100" }
    });
    expect(rangeRes.status()).toBe(206);

    const invalidRanges = [
      "bits=0-100",
      "bytes=0-100,200-300",
      "bytes=-500abc",
      "bytes=0-100abc",
      "bytes=999999-",
      "bytes=-"
    ];
    for (const invalid of invalidRanges) {
      const errRes = await guestContext.request.get(videoSrc!, {
        headers: { Range: invalid }
      });
      expect(errRes.status()).toBe(416);
    }

    // 14. Accès invité refusé en 404 aux médias mariés
    // Find couple media ID using API
    const mediaDb = new DatabaseSync(galleryDbPath);
    const adminPhotos = mediaDb.prepare("SELECT id, original_name, type, visibility FROM gallery_media WHERE gallery_id = ?").all(galleryId) as Record<string, unknown>[];
    mediaDb.close();
    const coupleMediaId = adminPhotos.find((p: Record<string, unknown>) => p.visibility === "maries")!.id;
    const forbidRes = await guestContext.request.get(`/api/gallery/${galleryPublicId}/media/${coupleMediaId}`);
    expect(forbidRes.status()).toBe(404);

    // 15-16. ZIP invités photos, vidéos et all sans médias mariés
    for (const type of ["photos", "videos", "all"]) {
      const zipRes = await guestContext.request.get(`/api/gallery/${galleryPublicId}/download?type=${type}`);
      expect(zipRes.status()).toBe(200);
      const zipBuffer = await zipRes.body();
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries().map(e => e.entryName);

      if (type === "photos") {
        expect(entries.length).toBe(25);
      } else if (type === "videos") {
        expect(entries.length).toBe(1);
      } else {
        expect(entries.length).toBe(26);
      }

      for (const entry of entries) {
        expect(entry).not.toContain("maries");
        expect(entry).not.toContain("couple");
      }
    }

    // 17. Connexion mariés
    await couplePage.goto("/fr/espace-clients");
    await couplePage.fill('input[name="code"]', coupleCode);
    await couplePage.click('button[type="submit"]');
    await couplePage.waitForURL(`/fr/galerie/${galleryPublicId}`);

    // 18. Visibilité des médias invités et mariés
    // 25 guest photos + 1 couple photo + 1 guest video + 1 couple video = 28
    // Mariés sees all 28. Pagination is 24 items, so need to click see more.
    await expect(couplePage.getByTestId('gallery-photo')).toHaveCount(24);
    await couplePage.locator('button:has-text("Voir plus")').click();
    await expect(couplePage.getByTestId('gallery-photo')).toHaveCount(26);
    await expect(couplePage.getByTestId('gallery-video')).toHaveCount(2);

    // 19. ZIP mariés contenant les 4 catégories
    const coupleZipRes = await coupleContext.request.get(`/api/gallery/${galleryPublicId}/download?type=all`);
    expect(coupleZipRes.status()).toBe(200);
    const coupleZip = new AdmZip(await coupleZipRes.body());
    expect(coupleZip.getEntries().length).toBe(28);

    // 20. Téléchargement original (SHA-256 identique)
    // Find guest photo 1 ID
    const guestMediaId = adminPhotos.find((p: Record<string, unknown>) => p.original_name === "guest-photo-1.jpg")!.id;
    const origRes = await coupleContext.request.get(`/api/gallery/${galleryPublicId}/download/original/${guestMediaId}`);
    expect(origRes.status()).toBe(200);
    const origBuffer = await origRes.body();
    const origHash = crypto.createHash("sha256").update(origBuffer).digest("hex");

    const fixtureBuffer = fs.readFileSync(path.join(targetDir, "invites/photos/guest-photo-1.jpg"));
    const fixtureHash = crypto.createHash("sha256").update(fixtureBuffer).digest("hex");
    expect(origHash).toBe(fixtureHash);

    // 21. Véritables contenus FR et EN
    const frRes = await coupleContext.request.get(`/fr/galerie/${galleryPublicId}`);
    const frText = await frRes.text();
    expect(frText).toContain("Déconnexion");

    const enRes = await coupleContext.request.get(`/en/gallery/${galleryPublicId}`);
    const enText = await enRes.text();
    expect(enText).toContain("Logout");

    // 26. Rotation du code invités
    await adminPage.goto(`/admin/galleries/${galleryId}`);
    const [rotationResponse] = await Promise.all([
      adminPage.waitForResponse(res => res.url().includes('/admin/galleries') && res.request().method() === 'POST'),
      adminPage.click('button:has-text("Régénérer auto le code invités")')
    ]);
    expect(rotationResponse.status()).toBe(200);

    const newGuestCodeInput = adminPage.getByLabel("Code invités actuel");
    await expect(newGuestCodeInput).not.toHaveValue(originalGuestCode);
    const newGuestCode = await newGuestCodeInput.inputValue();

    // 27. Refus de l'ancien code
    const invalidGuestContext = await browser.newContext();
    const invalidGuestPage = await invalidGuestContext.newPage();
    await invalidGuestPage.goto("/fr/espace-clients");
    await invalidGuestPage.fill('input[name="code"]', originalGuestCode);
    await invalidGuestPage.click('button[type="submit"]');
    await expect(invalidGuestPage.locator("text=invalide")).toBeVisible();

    // 28. Invalidation d'une session invitée déjà connectée avant la rotation
    const oldSessionRes = await oldGuestContext.request.get(`/api/gallery/${galleryPublicId}/download?type=photos`);
    // Should be unauthorized
    expect(oldSessionRes.status()).toBe(401);

    // 29. Fonctionnement du nouveau code
    const newGuestContext = await browser.newContext();
    const newGuestPage = await newGuestContext.newPage();
    await newGuestPage.goto("/fr/espace-clients");
    await newGuestPage.fill('input[name="code"]', newGuestCode);
    await newGuestPage.click('button[type="submit"]');
    await newGuestPage.waitForURL(`/fr/galerie/${galleryPublicId}`);

    // 30. Expiration forcée avec DatabaseSync, suivie d'un refus d'accès
    const expireDb = new DatabaseSync(galleryDbPath);
    expireDb.prepare("UPDATE galleries SET expires_at = ? WHERE id = ?").run(Date.now() - 86400000, galleryId);
    expireDb.close();

    const expiredRes = await newGuestContext.request.get(`/fr/galerie/${galleryPublicId}`);
    // Unexpired is 200. Expired should redirect to login.
        expect(expiredRes.url()).toContain("espace-clients");

    // 31. Restauration d'une expiration future
    const restoreDb = new DatabaseSync(galleryDbPath);
    restoreDb.prepare("UPDATE galleries SET expires_at = ? WHERE id = ?").run(Date.now() + 86400000, galleryId);
    restoreDb.close();

    const restoredRes = await newGuestContext.request.get(`/fr/galerie/${galleryPublicId}`);
    expect(restoredRes.status()).toBe(200);
    expect(restoredRes.url()).not.toContain("espace-clients");

    // 32. Archivage par l'admin
    await adminPage.selectOption('select[name="status"]', "archived");
    await adminPage.click('button:has-text("Enregistrer les informations")');
    await expect(
      adminPage.getByRole("status")
    ).toHaveText("Enregistré.");

    // 33. Refus d'accès après archivage
    const archivedRes = await newGuestContext.request.get(`/fr/galerie/${galleryPublicId}`);
    expect(archivedRes.url()).toContain("espace-clients");
  });
});
