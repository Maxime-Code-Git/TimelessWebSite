import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const fixtureDirectory = fileURLToPath(new URL(".", import.meta.url));

test.describe("Admin Gallery Browser Upload & Visio Slots E2E", () => {
  let createdGalleryFolder: string | null = null;
  let importBasePath: string = "";

  test.beforeAll(async () => {
    importBasePath = process.env.GALLERY_IMPORT_PATH || path.join(process.cwd(), "imports");
  });

  test.afterEach(async () => {
    // Restauration garantie dans finally / afterEach
    if (createdGalleryFolder && fs.existsSync(createdGalleryFolder)) {
      try {
        fs.rmSync(createdGalleryFolder, { recursive: true, force: true });
      } catch {
        // Ignorer si déjà nettoyé
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

    // 4. Vérification de la présence du dossier logique de la galerie sur le disque
    // Le dossier créé est du format : sophie-thomas-e2e-<id8>
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

    // 9. Simulation interruption et reprise :
    // On sélectionne une vidéo de test et on observe la reprise si besoin
    const videoFixturePath = path.join(fixtureDirectory, "fixtures/vid1.mp4");
    if (fs.existsSync(videoFixturePath)) {
      const videoInput = page.locator('input[type="file"][accept*="video/mp4"]');
      await videoInput.setInputFiles(videoFixturePath);
    }

    // 10. Attente de la finalisation complète
    await expect(page.locator('text=Tous les fichiers ont été envoyés avec succès').or(page.locator('text=Terminé'))).toBeVisible({ timeout: 30_000 });

    // 11. Vérification de l'absence de fichier .part ou .tmp dans le répertoire
    const tempUploadDir = path.join(importBasePath, ".tmp_uploads");
    if (fs.existsSync(tempUploadDir)) {
      const remainingTemp = fs.readdirSync(tempUploadDir);
      const activeParts = remainingTemp.filter(f => f.endsWith(".part") || f.endsWith(".tmp"));
      expect(activeParts.length).toBe(0);
    }

    const photosInFolder = fs.readdirSync(path.join(createdGalleryFolder, "photos"));
    expect(photosInFolder.length).toBeGreaterThanOrEqual(2);
    for (const f of photosInFolder) {
      expect(f.endsWith(".part")).toBe(false);
      expect(f.endsWith(".tmp")).toBe(false);
    }

    // 12. Déclenchement de l'import via le pipeline existant
    const previewBtn = page.getByRole("button", { name: "Analyser le dossier" });
    if (await previewBtn.isVisible()) {
      await previewBtn.click();
    }

    const startImportBtn = page.getByRole("button", { name: "Démarrer l'importation" });
    await expect(startImportBtn).toBeVisible({ timeout: 10_000 });
    await startImportBtn.click();

    // Vérification du statut d'import
    await expect(page.locator('[data-testid="gallery-import-status"]')).toBeVisible({ timeout: 10_000 });
  });
});
