import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";

test.describe("Admin Gallery Browser Upload & Visio Slots E2E", () => {
  let createdGalleryFolder: string | null = null;
  let createdGalleryId: string | null = null;
  let importBasePath: string = "";

  test.beforeAll(async () => {
    const rawImportPath = process.env.GALLERY_IMPORT_PATH || path.join(process.cwd(), "imports");
    importBasePath = fs.existsSync(rawImportPath) ? fs.realpathSync(rawImportPath) : rawImportPath;
  });

  test.afterEach(async () => {
    // Restauration garantie et isolation stricte dans finally / afterEach
    if (createdGalleryFolder && fs.existsSync(createdGalleryFolder)) {
      try {
        fs.rmSync(createdGalleryFolder, { recursive: true, force: true });
      } catch {
        // Ignorer si déjà nettoyé
      }
    }

    if (createdGalleryId) {
      const dbPath = process.env.GALLERY_DB_PATH;
      if (dbPath && fs.existsSync(dbPath)) {
        try {
          const db = new DatabaseSync(dbPath);
          db.prepare("DELETE FROM gallery_deletion_jobs WHERE gallery_id = ?").run(createdGalleryId);
          db.prepare("DELETE FROM gallery_media WHERE gallery_id = ?").run(createdGalleryId);
          db.prepare("DELETE FROM gallery_imports WHERE gallery_id = ?").run(createdGalleryId);
          db.prepare("DELETE FROM galleries WHERE id = ?").run(createdGalleryId);
          db.close();
        } catch {
          // Ignorer si échec de suppression DB de test
        }
      }

      const mediaBasePath = process.env.GALLERY_MEDIA_PATH;
      if (mediaBasePath) {
        const galleryMediaDir = path.join(mediaBasePath, createdGalleryId);
        if (fs.existsSync(galleryMediaDir)) {
          try {
            fs.rmSync(galleryMediaDir, { recursive: true, force: true });
          } catch {
            // Ignorer si déjà nettoyé
          }
        }
      }
    }
  });

  test("Cycle complet : connexion, créneaux visio, création galerie, destination Invités/Mariés, envoi multi-morceaux > 5 Mo sans réessai, finalisation, import et permissions", async ({ page, browser }) => {
    test.setTimeout(180_000);

    // 1. Connexion administrateur
    await page.goto("/admin");
    const passwordInput = page.locator('input[name="password"]');
    if (await passwordInput.isVisible()) {
      await passwordInput.fill("e2e_password");
      await page.getByRole("button", { name: "Se connecter", exact: true }).click();
      await expect(page.locator("h1")).toHaveText("Administration Sempra");
    }

    // 2. Vérification des créneaux visio (Sempra) : 10:00, 12:00, 14:00, 16:00, 18:00
    await page.goto("/fr/contact");
    const visioSection = page.locator("#visio-booking-section");
    if (await visioSection.isVisible()) {
      const timeSelect = page.locator("#visio-time");
      await expect(timeSelect).toBeVisible();

      const timeOptions = await timeSelect.locator("option").allInnerTexts();
      const expectedSlots = ["10:00", "12:00", "14:00", "16:00", "18:00"];
      for (const slot of expectedSlots) {
        const found = timeOptions.some(opt => opt.includes(slot));
        expect(found, `Le créneau visio ${slot} doit être présent`).toBe(true);
      }
    }

    // 3. Création d'une nouvelle galerie
    await page.goto("/admin/galleries/new");
    await page.fill('input[name="bride_names"]', "Sophie & Thomas E2E");
    await page.fill('input[name="wedding_date"]', "2027-08-20");
    await page.fill('input[name="location"]', "Domaine du Lac");
    await page.click('button[type="submit"]');

    await page.waitForURL(url => {
      const match = url.pathname.match(/^\/admin\/galleries\/([^/]+)$/);
      return Boolean(match && match[1] !== "new");
    });

    const galleryMatch = new URL(page.url()).pathname.match(/^\/admin\/galleries\/([^/]+)$/);
    expect(galleryMatch).toBeTruthy();
    const galleryId = galleryMatch![1];
    createdGalleryId = galleryId;

    // 4. Vérification de la présence du dossier logique de la galerie sur le disque
    const subdirs = fs.readdirSync(importBasePath);
    const galleryFolder = subdirs.find(d => d.includes(galleryId));
    expect(galleryFolder).toBeDefined();

    createdGalleryFolder = path.join(importBasePath, galleryFolder!);
    expect(fs.existsSync(createdGalleryFolder)).toBe(true);
    expect(fs.existsSync(path.join(createdGalleryFolder, "invites", "photos"))).toBe(true);
    expect(fs.existsSync(path.join(createdGalleryFolder, "invites", "videos"))).toBe(true);
    expect(fs.existsSync(path.join(createdGalleryFolder, "maries", "photos"))).toBe(true);
    expect(fs.existsSync(path.join(createdGalleryFolder, "maries", "videos"))).toBe(true);

    // 5. Groupe de choix accessible Invités / Mariés et boutons d'import
    const fieldset = page.getByRole("group", { name: "Destination des médias à sélectionner :" });
    await expect(fieldset).toBeVisible();

    const guestRadio = page.getByRole("radio", { name: /Invités - visible par tous les détenteurs d'un code/ });
    const coupleRadio = page.getByRole("radio", { name: /Mariés uniquement - visible uniquement avec le code mariés/ });
    await expect(guestRadio).toBeVisible();
    await expect(coupleRadio).toBeVisible();
    await expect(guestRadio).toBeChecked();
    await expect(coupleRadio).not.toBeChecked();

    const photosBtn = page.getByRole("button", { name: /Importer des photos/ });
    const videosBtn = page.getByRole("button", { name: /Importer des vidéos/ });
    await expect(photosBtn).toBeVisible();
    await expect(videosBtn).toBeVisible();

    // Monitoring des requêtes HTTP d'upload serveur (init, chunk, status, finalize)
    const monitoredUploadResponses: { action: string; status: number }[] = [];
    page.on("response", response => {
      const url = response.url();
      if (url.includes(`/api/admin/gallery-upload/${galleryId}`)) {
        const parsedUrl = new URL(url);
        const action = parsedUrl.searchParams.get("action") || "unknown";
        monitoredUploadResponses.push({ action, status: response.status() });
      }
    });

    // 6. Génération dynamique de deux vrais JPEG valides dépassant CHUNK_SIZE (> 5 Mo)
    // 3000 x 2400 avec bruit aléatoire produit un JPEG valide d'environ 5.5 Mo
    const rawNoise1 = crypto.randomBytes(3000 * 2400 * 3);
    const guestPhotoBuffer = await sharp(rawNoise1, { raw: { width: 3000, height: 2400, channels: 3 } })
      .jpeg({ quality: 90 })
      .toBuffer();
    expect(guestPhotoBuffer.length).toBeGreaterThan(5 * 1024 * 1024);

    const rawNoise2 = crypto.randomBytes(3000 * 2400 * 3);
    const couplePhotoBuffer = await sharp(rawNoise2, { raw: { width: 3000, height: 2400, channels: 3 } })
      .jpeg({ quality: 90 })
      .toBuffer();
    expect(couplePhotoBuffer.length).toBeGreaterThan(5 * 1024 * 1024);

    const photoInput = page.locator('input[type="file"][accept*="image/jpeg"]');

    // 7. Envoi de la première photo avec la destination par défaut (Invités)
    await photoInput.setInputFiles([
      { name: "test-guest-big.jpg", mimeType: "image/jpeg", buffer: guestPhotoBuffer },
    ]);
    await expect(page.locator('[title="test-guest-big.jpg"]')).toBeVisible({ timeout: 10_000 });

    // 8. Bascule sur la destination "Mariés uniquement" et sélection de la deuxième photo
    await coupleRadio.click();
    await expect(coupleRadio).toBeChecked();

    await photoInput.setInputFiles([
      { name: "test-couple-big.jpg", mimeType: "image/jpeg", buffer: couplePhotoBuffer },
    ]);
    await expect(page.locator('[title="test-couple-big.jpg"]')).toBeVisible({ timeout: 10_000 });

    // 9. Attente de la finalisation complète côté UI et serveur SANS cliquer sur Réessayer
    const batchSuccessMessage = page.locator('p[role="status"]').filter({
      hasText: "Tous les fichiers ont été envoyés avec succès"
    });
    await expect(batchSuccessMessage).toBeVisible({ timeout: 90_000 });

    // Vérifier que le message mentionne explicitement la destination Invités et Mariés
    await expect(batchSuccessMessage).toContainText("1 Invités");
    await expect(batchSuccessMessage).toContainText("1 Mariés");

    // Aucun message d'erreur d'envoi affiché
    await expect(page.locator('[role="alert"]').filter({ hasText: "Échec" })).toHaveCount(0);

    // 10. Vérification que toutes les requêtes init/chunk/finalize sont en succès (200)
    expect(monitoredUploadResponses.length).toBeGreaterThan(0);
    for (const item of monitoredUploadResponses) {
      expect(item.status, `La requête ${item.action} doit réussir avec le statut 200`).toBe(200);
    }
    expect(monitoredUploadResponses.some(r => r.action === "init")).toBe(true);
    expect(monitoredUploadResponses.some(r => r.action === "chunk")).toBe(true);
    expect(monitoredUploadResponses.some(r => r.action === "finalize")).toBe(true);

    // 11. Vérification sur le disque : dossiers Invités et Mariés, aucun .part ni .tmp résiduel
    const guestPhotosDir = path.join(createdGalleryFolder, "invites", "photos");
    const couplePhotosDir = path.join(createdGalleryFolder, "maries", "photos");

    expect(fs.existsSync(path.join(guestPhotosDir, "test-guest-big.jpg"))).toBe(true);
    expect(fs.existsSync(path.join(couplePhotosDir, "test-couple-big.jpg"))).toBe(true);

    for (const f of fs.readdirSync(guestPhotosDir)) {
      expect(f.endsWith(".part"), `Aucun fichier .part dans invites/photos/ (${f})`).toBe(false);
      expect(f.endsWith(".tmp"), `Aucun fichier .tmp dans invites/photos/ (${f})`).toBe(false);
    }
    for (const f of fs.readdirSync(couplePhotosDir)) {
      expect(f.endsWith(".part"), `Aucun fichier .part dans maries/photos/ (${f})`).toBe(false);
      expect(f.endsWith(".tmp"), `Aucun fichier .tmp dans maries/photos/ (${f})`).toBe(false);
    }

    const tempUploadDir = path.join(createdGalleryFolder, ".tmp_uploads");
    if (fs.existsSync(tempUploadDir)) {
      const remainingTemp = fs.readdirSync(tempUploadDir);
      expect(remainingTemp.length, "Aucune session d'upload temporaire résiduelle").toBe(0);
    }

    // 12. Analyse automatique du dossier et exactitude des compteurs
    await expect(page.getByText("médias trouvés", { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Invités : 1 photos/)).toBeVisible();
    await expect(page.getByText(/Mariés : 1 photos/)).toBeVisible();

    // 13. Lancement de l'import et attente de fin
    const startImportBtn = page.getByRole("button", { name: "Confirmer et lancer l'import", exact: true });
    await expect(startImportBtn).toBeVisible({ timeout: 10_000 });
    await startImportBtn.click();

    await expect(page.locator('[data-testid="gallery-import-status"]')).toHaveText("Import lancé.", { timeout: 10_000 });

    await expect(async () => {
      const res = await page.request.get(`/api/admin/gallery-import/${galleryId}?poll=${Date.now()}`);
      expect(res.status()).toBe(200);
      const data = await res.json() as {
        importState: {
          status: string;
          progress: number;
          total: number;
        } | null;
      };
      expect(data.importState).not.toBeNull();
      expect(data.importState?.status).toBe("completed");
    }).toPass({ timeout: 45_000 });

    // Recharger la page pour refléter les médias importés
    await page.reload();

    // 14. Publication de la galerie pour permettre la connexion client
    await page.selectOption('select[name="status"]', "published");
    const savePromise = page.waitForResponse(
      res => res.url().includes(`/admin/galleries/${galleryId}`) && res.request().method() === "POST"
    );
    await page.click('button:has-text("Enregistrer les informations")');
    const saveRes = await savePromise;
    expect(saveRes.status()).toBe(200);
    await expect(page.getByRole("status").filter({ hasText: "Enregistré." })).toBeVisible();

    // Récupération des codes d'accès et des identifiants médias
    await page.click("text=Afficher les codes");
    const guestCode = await page.getByLabel("Code invités actuel").inputValue();
    const coupleCode = await page.getByLabel("Code mariés actuel").inputValue();
    expect(guestCode).toBeTruthy();
    expect(coupleCode).toBeTruthy();

    const dbPath = process.env.GALLERY_DB_PATH!;
    const db = new DatabaseSync(dbPath);
    const galRow = db.prepare("SELECT public_id FROM galleries WHERE id = ?").get(galleryId) as { public_id: string };
    const mediaRows = db.prepare("SELECT id, original_name, visibility FROM gallery_media WHERE gallery_id = ?").all(galleryId) as { id: string; original_name: string; visibility: string }[];
    db.close();

    const publicId = galRow.public_id;
    const guestMedia = mediaRows.find(m => m.visibility === "invites");
    const coupleMedia = mediaRows.find(m => m.visibility === "maries");

    expect(guestMedia).toBeDefined();
    expect(coupleMedia).toBeDefined();

    // 15. Vérification des droits réels pour le code invité :
    // Le code invité ne voit jamais les médias Mariés
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    await guestPage.goto("/fr/espace-clients");
    await guestPage.waitForSelector('body[data-hydrated="true"]');
    const guestLoginPromise = guestPage.waitForResponse(
      res => res.url().includes("/fr/espace-clients") && res.request().method() === "POST"
    );
    await guestPage.fill('input[name="code"]', guestCode);
    await guestPage.click('button[type="submit"]');
    const guestLoginResponse = await guestLoginPromise;
    expect(guestLoginResponse.status()).toBeLessThan(400);

    await guestPage.waitForURL(url => url.pathname.includes(`/fr/galerie/${publicId}`));
    await expect(guestPage.getByTestId("gallery-view")).toBeVisible();

    // Vérification visuelle côté invité : 1 seule photo (celle des Invités)
    await expect(guestPage.getByTestId("gallery-photo")).toHaveCount(1);
    const guestHtml = await guestPage.content();
    expect(guestHtml).not.toContain(coupleMedia!.id);

    // Accès direct HTTP interdit en 404 au média Mariés
    const guestForbiddenRes = await guestContext.request.get(`/api/gallery/${publicId}/media/${coupleMedia!.id}?width=480&format=webp`);
    expect(guestForbiddenRes.status()).toBe(404);

    await guestContext.close();

    // 16. Vérification des droits réels pour le code mariés :
    // Le code mariés voit les médias Invités et Mariés (2 photos au total)
    const coupleContext = await browser.newContext();
    const couplePage = await coupleContext.newPage();

    await couplePage.goto("/fr/espace-clients");
    await couplePage.waitForSelector('body[data-hydrated="true"]');
    const coupleLoginPromise = couplePage.waitForResponse(
      res => res.url().includes("/fr/espace-clients") && res.request().method() === "POST"
    );
    await couplePage.fill('input[name="code"]', coupleCode);
    await couplePage.click('button[type="submit"]');
    const coupleLoginResponse = await coupleLoginPromise;
    expect(coupleLoginResponse.status()).toBeLessThan(400);

    await couplePage.waitForURL(url => url.pathname.includes(`/fr/galerie/${publicId}`));
    await expect(couplePage.getByTestId("gallery-view")).toBeVisible();

    // Vérification visuelle côté mariés : 2 photos visibles (Invités + Mariés)
    await expect(couplePage.getByTestId("gallery-photo")).toHaveCount(2);

    // Accès direct HTTP autorisé en 200 au média Mariés
    const coupleAllowedRes = await coupleContext.request.get(`/api/gallery/${publicId}/media/${coupleMedia!.id}?width=480&format=webp`);
    expect(coupleAllowedRes.status()).toBe(200);

    await coupleContext.close();
  });
});
