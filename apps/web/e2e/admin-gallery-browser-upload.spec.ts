import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";

const fixtureDirectory = fileURLToPath(new URL(".", import.meta.url));

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

  test("Cycle complet : connexion, créneaux visio, création galerie, dossier logique, upload par morceaux, reprise, finalisation et import", async ({ page }) => {
    test.setTimeout(120_000);

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

      // Vérification que les nouveaux créneaux sont présents
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
    const galleryFolder = subdirs.find(d => d.startsWith("sophie-thomas-e2e") || d.includes(galleryId.slice(0, 8)));
    expect(galleryFolder).toBeDefined();

    createdGalleryFolder = path.join(importBasePath, galleryFolder!);
    expect(fs.existsSync(createdGalleryFolder)).toBe(true);
    expect(fs.existsSync(path.join(createdGalleryFolder, "photos"))).toBe(true);
    expect(fs.existsSync(path.join(createdGalleryFolder, "videos"))).toBe(true);

    // 5. Présence des deux boutons sur la page d'administration
    const photosBtn = page.getByRole("button", { name: "Importer des photos" });
    const videosBtn = page.getByRole("button", { name: "Importer des vidéos" });
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

    // 6. Préparation des médias de test
    const photo1Buffer = await sharp({ create: { width: 80, height: 80, channels: 3, background: { r: 120, g: 60, b: 200 } } }).jpeg().toBuffer();
    const photo2Buffer = await sharp({ create: { width: 80, height: 80, channels: 3, background: { r: 200, g: 120, b: 60 } } }).jpeg().toBuffer();

    // 7. Upload de plusieurs petites photos via le sélecteur accessible
    const photoInput = page.locator('input[type="file"][accept*="image/jpeg"]');
    await photoInput.setInputFiles([
      { name: "test-photo-1.jpg", mimeType: "image/jpeg", buffer: photo1Buffer },
      { name: "test-photo-2.jpg", mimeType: "image/jpeg", buffer: photo2Buffer },
    ]);

    // 8. Vérification de l'affichage de la progression
    await expect(page.locator('progress[aria-label*="Progression"]').first()).toBeVisible({ timeout: 10_000 });

    // 9. Simulation sélection d'une vidéo de test
    const videoFixturePath = path.join(fixtureDirectory, "fixtures/vid1.mp4");
    let hasVideo = false;
    if (fs.existsSync(videoFixturePath)) {
      hasVideo = true;
      const videoInput = page.locator('input[type="file"][accept*="video/mp4"]');
      await videoInput.setInputFiles(videoFixturePath);
    }

    // 10. Attente de la finalisation complète côté UI et serveur
    const batchSuccessMessage = page.locator('p[role="status"]').filter({
      hasText: "Tous les fichiers ont été envoyés avec succès"
    });
    await expect(batchSuccessMessage).toBeVisible({ timeout: 30_000 });

    // Aucune erreur d'envoi affichée
    await expect(page.locator('[role="alert"]').filter({ hasText: "Erreur" })).toHaveCount(0);

    // Vérification des statuts HTTP serveur (init, chunk, finalize doivent être 200)
    expect(monitoredUploadResponses.length).toBeGreaterThan(0);
    for (const item of monitoredUploadResponses) {
      expect(item.status, `La requête ${item.action} doit réussir avec le statut 200`).toBe(200);
    }
    expect(monitoredUploadResponses.some(r => r.action === "init")).toBe(true);
    expect(monitoredUploadResponses.some(r => r.action === "chunk")).toBe(true);
    expect(monitoredUploadResponses.some(r => r.action === "finalize")).toBe(true);

    // 11. a & b : Vérification de la présence des fichiers finaux et de l'absence de traces temporaires
    const photosInFolder = fs.readdirSync(path.join(createdGalleryFolder, "photos"));
    expect(photosInFolder.length).toBeGreaterThanOrEqual(2);
    expect(photosInFolder).toContain("test-photo-1.jpg");
    expect(photosInFolder).toContain("test-photo-2.jpg");
    for (const f of photosInFolder) {
      expect(f.endsWith(".part"), `Aucun fichier .part dans photos/ (${f})`).toBe(false);
      expect(f.endsWith(".tmp"), `Aucun fichier .tmp dans photos/ (${f})`).toBe(false);
    }

    if (hasVideo) {
      const videosInFolder = fs.readdirSync(path.join(createdGalleryFolder, "videos"));
      expect(videosInFolder.length).toBeGreaterThanOrEqual(1);
      expect(videosInFolder).toContain("vid1.mp4");
      for (const f of videosInFolder) {
        expect(f.endsWith(".part"), `Aucun fichier .part dans videos/ (${f})`).toBe(false);
        expect(f.endsWith(".tmp"), `Aucun fichier .tmp dans videos/ (${f})`).toBe(false);
      }
    }

    // Vérification de l'absence de fichiers temporaires dans .tmp_uploads
    const tempUploadDir = path.join(createdGalleryFolder, ".tmp_uploads");
    if (fs.existsSync(tempUploadDir)) {
      const remainingTemp = fs.readdirSync(tempUploadDir);
      expect(remainingTemp.length, "Aucune session d'upload temporaire résiduelle").toBe(0);
    }

    // 12. c : Analyse du dossier (prévisualisation import)
    await expect(page.getByText("médias trouvés", { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Invités : \d+ photos/)).toBeVisible();

    // 13. d : Déclenchement de l'import via le pipeline existant et attente de fin
    const startImportBtn = page.getByRole("button", { name: "Confirmer et lancer l'import", exact: true });
    await expect(startImportBtn).toBeVisible({ timeout: 10_000 });
    await startImportBtn.click();

    // Vérification du statut d'import initial
    await expect(page.locator('[data-testid="gallery-import-status"]')).toHaveText("Import lancé.", { timeout: 10_000 });

    // Attente déterministe de la fin complète de l'import
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
    }).toPass({ timeout: 30_000 });

    // 14. e : Vérification de la présence des médias importés dans la base et dans l'interface
    const dbPath = process.env.GALLERY_DB_PATH;
    if (dbPath && fs.existsSync(dbPath)) {
      const db = new DatabaseSync(dbPath);
      const row = db.prepare("SELECT count(*) as count FROM gallery_media WHERE gallery_id = ?").get(galleryId) as { count: number };
      expect(row.count).toBeGreaterThanOrEqual(2);
      db.close();
    }

    await page.reload();
    await expect(page.getByText(/Photos Invités : [1-9]/)).toBeVisible({ timeout: 10_000 });
  });
});
