import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { restoreDefaultSiteContent, writeSiteContent } from './test-helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultContentPath = path.resolve(__dirname, '../app/content/default-site-content.json');
const defaultContent = JSON.parse(fs.readFileSync(defaultContentPath, 'utf8'));

const intermediateV2Fixture = {
  "schemaVersion": 2,
  "revision": "abcdef1234567890abcdef1234567890",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "business": defaultContent.business,
  "pricing": defaultContent.pricing,
  "home": {
    "hero": {
      "smallTitle": { "fr": "Test", "en": "Test" },
      "largeTitle": { "fr": "Test", "en": "Test" },
      "subtitle": { "fr": "Test", "en": "Test" },
      "images": [
        { "imageId": null, "alt": { "fr": "Image", "en": "Image" }, "width": 960, "height": 1440 },
        { "imageId": null, "alt": { "fr": "Image", "en": "Image" }, "width": 960, "height": 1440 },
        { "imageId": null, "alt": { "fr": "Image", "en": "Image" }, "width": 960, "height": 1440 }
      ]
    },
    "editorial": {
      "paragraph": { "fr": "Test", "en": "Test" },
      "highlight": { "fr": "Test", "en": "Test" }
    },
    "portfolioCards": {
      "photo": {
        "imageId": null,
        "title": { "fr": "Photographie", "en": "Photography" },
        "subtitle": { "fr": "Lumière naturelle & moments volés", "en": "Natural light & candid moments" }
      },
      "video": {
        "imageId": null,
        "title": { "fr": "Film de mariage", "en": "Wedding Film" },
        "subtitle": { "fr": "Émotions en mouvement", "en": "Emotions in motion" }
      }
    },
    "pricingPreview": {
      "sectionTitle": { "fr": "Test", "en": "Test" },
      "essentialDescription": { "fr": "Test", "en": "Test" },
      "signatureDescription": { "fr": "Test", "en": "Test" },
      "prestigeDescription": { "fr": "Test", "en": "Test" },
      "promoText": { "fr": "Test", "en": "Test" },
      "promoTextBold": { "fr": "Test", "en": "Test" },
      "caveat": { "fr": "Test", "en": "Test" },
      "buttonText": { "fr": "Test", "en": "Test" },
      "customFormulaText": { "fr": "Test", "en": "Test" },
      "customFormulaTextEm": { "fr": "Test", "en": "Test" }
    },
    "studio": {
      "imageId": null,
      "title": { "fr": "Sempra", "en": "Sempra" },
      "description": { "fr": "L & M", "en": "L & M" }
    }
  }
};

test.describe('Admin Home Management', () => {

  test.beforeEach(async ({ page }) => {
    restoreDefaultSiteContent();
    // Login before each test
    await page.goto('/admin');
    await page.fill('input[name="password"]', 'e2e_password');
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toContainText('Administration Sempra');
  });

  test.afterEach(() => {
    restoreDefaultSiteContent();
  });

  test('full upload and replace image flow', async ({ page, request }) => {
    // Navigate to Admin Home
    await page.click('text=Accueil');
    await expect(page.locator('h1')).toContainText("Édition de l'Accueil");

    const imageBuffer = await sharp({
      create: {
        width: 800,
        height: 1200,
        channels: 3,
        background: { r: 120, g: 80, b: 60 },
      },
    }).jpeg().toBuffer();

    const fileInput = page.locator('input[type="file"]').first();

    const uploadResponsePromise = page.waitForResponse(
      response =>
        response.url().includes("/api/admin/home-image") &&
        response.request().method() === "POST"
    );

    await fileInput.setInputFiles({
      name: "home-hero-test.jpg",
      mimeType: "image/jpeg",
      buffer: imageBuffer,
    });

    const uploadResponse = await uploadResponsePromise;
    const uploadBody = await uploadResponse.json();
    expect(uploadResponse.status()).toBe(200);
    expect(uploadBody.success).toBe(true);
    expect(uploadBody.imageId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(uploadBody.variants.length).toBeGreaterThan(0);

    // Verify that the UI does NOT display any error alert after the upload
    await expect(page.locator('div[role="alert"]')).not.toBeVisible();

    // 3. Vérification admin que la page est modifiée IMMEDIATEMENT
    const imgPreview = page.getByTestId("home-image-preview-hero-0");
    await expect(imgPreview).toBeVisible();
    await expect(imgPreview).toHaveAttribute("alt", "Image hero 1"); // from default-site-content.json

    const publicUrl = await imgPreview.getAttribute('src');
    expect(publicUrl).toBeTruthy();

    // The form auto-submits is not what happens. Wait, `admin.home.tsx` only updates React state (and UI).
    // We must click 'Sauvegarder les modifications' to save the page content.
    await page.click('button[type="submit"]');
    await expect(page.locator('div[role="status"]')).toContainText("Les modifications ont été enregistrées avec succès.");

    // 4. Requête HTTP sur l'image publique (expect.poll pour attendre le 200)
    await expect.poll(async () => {
      const res = await request.get(publicUrl!);
      return res.status();
    }).toBe(200);

    // 5. Remplacement d'une image (vérifier que l'ancienne URL renvoie bien 404)
    const newImageBuffer = await sharp({
      create: {
        width: 800,
        height: 1200,
        channels: 3,
        background: { r: 60, g: 120, b: 80 },
      },
    }).jpeg().toBuffer();

    const newUploadResponsePromise = page.waitForResponse(
      response =>
        response.url().includes("/api/admin/home-image") &&
        response.request().method() === "POST"
    );

    await fileInput.setInputFiles({
      name: "home-hero-test-2.jpg",
      mimeType: "image/jpeg",
      buffer: newImageBuffer,
    });

    const newUploadResponse = await newUploadResponsePromise;
    expect(newUploadResponse.status()).toBe(200);

    const newImgPreview = page.getByTestId("home-image-preview-hero-0");
    await expect(newImgPreview).toBeVisible();
    const newPublicUrl = await newImgPreview.getAttribute('src');
    expect(newPublicUrl).not.toBe(publicUrl);

    await page.click('button[type="submit"]');
    await expect(page.locator('div[role="status"]')).toContainText("Les modifications ont été enregistrées avec succès.");

    await expect.poll(async () => {
      const res = await request.get(publicUrl!);
      return res.status();
    }).toBe(404);

    await expect.poll(async () => {
      const res = await request.get(newPublicUrl!);
      return res.status();
    }).toBe(200);

    // 6. Sauvegarde et rechargement (vérifier la persistance)
    await page.reload();
    await expect(page.getByTestId("home-image-preview-hero-0")).toHaveAttribute('src', newPublicUrl!);
  });

  test('migrates intermediate V2 content without data loss', async ({ page, request }) => {
    // Inject intermediate V2 fixture
    writeSiteContent(JSON.stringify(intermediateV2Fixture, null, 2));

    // Login and navigate
    await page.goto('/admin');
    await expect(page.locator('h1')).toContainText('Administration Sempra');
    await page.click('text=Accueil');
    await expect(page.locator('h1')).toContainText("Édition de l'Accueil");

    // The corruption alert should not be visible
    await expect(page.locator('div[role="alert"]')).not.toBeVisible();

    const imageBuffer = await sharp({
      create: {
        width: 800,
        height: 1200,
        channels: 3,
        background: { r: 100, g: 150, b: 200 },
      },
    }).jpeg().toBuffer();

    const fileInput = page.locator('input[type="file"]').first();

    const uploadResponsePromise = page.waitForResponse(
      response =>
        response.url().includes("/api/admin/home-image") &&
        response.request().method() === "POST"
    );

    await fileInput.setInputFiles({
      name: "migration-test.jpg",
      mimeType: "image/jpeg",
      buffer: imageBuffer,
    });

    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(200);

    // Save changes
    await page.click('button[type="submit"]');
    await expect(page.locator('div[role="status"]')).toContainText("Les modifications ont été enregistrées avec succès.");

    // Check public image
    const imgPreview = page.getByTestId("home-image-preview-hero-0");
    const publicUrl = await imgPreview.getAttribute('src');
    expect(publicUrl).toBeTruthy();

    await expect.poll(async () => {
      const res = await request.get(publicUrl!);
      return res.status();
    }).toBe(200);
  });
});
