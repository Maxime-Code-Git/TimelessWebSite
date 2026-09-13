import { test, expect } from "@playwright/test";
import { restoreDefaultSiteContent } from "./test-helpers";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

test.describe("Admin About Page", () => {
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

  test("loads the about admin page successfully", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Édition de la page À propos" })).toBeVisible();
    await expect(page.getByLabel("Titre SEO (fr)")).toHaveValue("À propos — Sempra");
  });

  test("can edit and save text content in both languages", async ({ page }) => {
    // Edit FR
    await page.getByLabel("Titre SEO (fr)").fill("À propos Modifié");
    
    // Switch to EN
    await page.getByRole("button", { name: "EN" }).click();
    await page.getByLabel("Titre SEO (en)").fill("About Modified");
    
    // Save
    await page.getByRole("button", { name: "Enregistrer les textes et métadonnées" }).click();
    await expect(page.getByRole("status")).toContainText("Les modifications ont été enregistrées avec succès.");
    
    // Refresh and verify
    await page.reload();
    await expect(page.getByLabel("Titre SEO (en)")).toHaveValue("About Modified");
    
    await page.getByRole("button", { name: "FR" }).click();
    await expect(page.getByLabel("Titre SEO (fr)")).toHaveValue("À propos Modifié");
  });

  test("can upload a team image", async ({ page }) => {
    const uploadBtn = page.getByRole("button", { name: "Ajouter une image" });
    await expect(uploadBtn).toBeVisible();

    const testImagePath = path.join(__dirname, "test-image.jpg");
    await fs.writeFile(testImagePath, crypto.randomBytes(1024));

    try {
      const fileChooserPromise = page.waitForEvent('filechooser');
      await uploadBtn.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(testImagePath);

      // Verify the image preview appears
      await expect(page.getByTestId("about-image-preview-about-team")).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole("button", { name: "Remplacer l'image" })).toBeVisible();

      // Save the form
      await page.getByRole("button", { name: "Enregistrer les textes et métadonnées" }).click();
      await expect(page.getByRole("status")).toContainText("Les modifications ont été enregistrées avec succès.");
      
      // Reload and verify image is still there
      await page.reload();
      await expect(page.getByTestId("about-image-preview-about-team")).toBeVisible();
    } finally {
      await fs.unlink(testImagePath).catch(() => {});
    }
  });
  
  test("prevents saving with too long titles", async ({ page }) => {
    const longText = "a".repeat(300);
    await page.getByLabel("Titre SEO (fr)").fill(longText);
    await page.getByRole("button", { name: "Enregistrer les textes et métadonnées" }).click();
    await expect(page.getByRole("alert")).toContainText("too long");
  });
});
