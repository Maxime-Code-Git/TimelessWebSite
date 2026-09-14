import { test, expect } from "@playwright/test";
import { restoreDefaultSiteContent } from "./test-helpers";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";

test.describe("Admin About Page", () => {
  let firstImagePath: string;
  let secondImagePath: string;

  test.beforeAll(async () => {
    firstImagePath = path.join(__dirname, "test-image-1.jpg");
    secondImagePath = path.join(__dirname, "test-image-2.jpg");
    await sharp({
      create: {
        width: 800,
        height: 1000,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    }).jpeg().toFile(firstImagePath);
    await sharp({
      create: {
        width: 800,
        height: 1000,
        channels: 3,
        background: { r: 0, g: 255, b: 0 }
      }
    }).jpeg().toFile(secondImagePath);
  });

  test.afterAll(async () => {
    await fs.unlink(firstImagePath).catch(() => {});
    await fs.unlink(secondImagePath).catch(() => {});
  });

  test.beforeEach(async ({ page }) => {
    await restoreDefaultSiteContent();
    await page.goto("/admin");
    await page.fill('input[name="password"]', 'e2e_password');
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toContainText('Administration Sempra');
    await page.goto("/admin/about");
  });

  test.afterEach(async () => {
    await restoreDefaultSiteContent();
  });

  test("can edit texts and upload images, verify on public pages", async ({ page, request }) => {
    // 1. Edit FR texts
    await page.getByLabel("Titre SEO (fr)").fill("SEO FR Modifié");
    await page.getByLabel("Titre principal (fr)").fill("Hero FR Modifié");
    await page.getByLabel("Texte alternatif (fr)").fill("Alt FR");

    // 2. Edit EN texts
    await page.getByRole("button", { name: "EN" }).click();
    await page.getByLabel("Titre SEO (en)").fill("SEO EN Modified");
    await page.getByLabel("Titre principal (en)").fill("Hero EN Modified");
    await page.getByLabel("Texte alternatif (en)").fill("Alt EN");
    await page.getByRole("button", { name: "FR" }).click();

    // 3. Upload first image
    const uploadBtn = page.getByRole("button", { name: "Ajouter une image" });
    const fileChooserPromise = page.waitForEvent('filechooser');
    await uploadBtn.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(firstImagePath);

    // Wait for upload preview
    const preview = page.getByTestId("about-image-preview-about-team");
    await expect(preview).toBeVisible({ timeout: 10000 });

    // Save
    await page.getByRole("button", { name: "Enregistrer les textes et métadonnées" }).click();
    await expect(page.getByRole("status")).toContainText("Les modifications ont été enregistrées avec succès.");

    // Extract image URL from preview
    const imgSrc = await preview.getAttribute("src");
    expect(imgSrc).toBeTruthy();

    // Verify image HTTP 200
    const res1 = await request.get(imgSrc!);
    expect(res1.status()).toBe(200);

    // 4. Verify public page FR
    await page.goto("/fr/a-propos");
    await expect(page.locator("h1")).toContainText("Hero FR Modifié");
    await expect(page.locator("title")).toHaveText("SEO FR Modifié");
    const pubImgFr = page.locator("picture img");
    await expect(pubImgFr).toHaveAttribute("alt", "Alt FR");

    // 5. Verify public page EN
    await page.goto("/en/about");
    await expect(page.locator("h1")).toContainText("Hero EN Modified");
    await expect(page.locator("title")).toHaveText("SEO EN Modified");
    const pubImgEn = page.locator("picture img");
    await expect(pubImgEn).toHaveAttribute("alt", "Alt EN");

    // 6. Replace image
    await page.goto("/admin/about");
    const replaceBtn = page.getByRole("button", { name: "Remplacer l'image" });
    const fileChooserPromise2 = page.waitForEvent('filechooser');
    await replaceBtn.click();
    const fileChooser2 = await fileChooserPromise2;
    await fileChooser2.setFiles(secondImagePath);

    await page.waitForTimeout(1000); // Wait for upload
    const preview2 = page.getByTestId("about-image-preview-about-team");
    await expect(preview2).toBeVisible({ timeout: 10000 });
    const newImgSrc = await preview2.getAttribute("src");
    expect(newImgSrc).not.toBe(imgSrc);

    // Save
    await page.getByRole("button", { name: "Enregistrer les textes et métadonnées" }).click();
    await expect(page.getByRole("status")).toContainText("Les modifications ont été enregistrées avec succès.");

    // Verify old image 404
    const resOld = await request.get(imgSrc!);
    expect(resOld.status()).toBe(404);

    // Verify new image 200
    const resNew = await request.get(newImgSrc!);
    expect(resNew.status()).toBe(200);

    // 7. Delete image
    const deleteBtn = page.getByRole("button", { name: "Supprimer" });
    await deleteBtn.click();
    await page.getByRole("button", { name: "Enregistrer les textes et métadonnées" }).click();
    await expect(page.getByRole("status")).toContainText("Les modifications ont été enregistrées avec succès.");

    // Verify deleted image 404
    const resDeleted = await request.get(newImgSrc!);
    expect(resDeleted.status()).toBe(404);

    // Verify public page fallback
    await page.goto("/fr/a-propos");
    await expect(page.locator("picture")).not.toBeVisible();
  });
});
