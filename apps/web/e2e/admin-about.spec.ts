import { test, expect, type Page } from "@playwright/test";
import { restoreDefaultSiteContent } from "./test-helpers";
import sharp from "sharp";

async function saveAboutPage(page: Page) {
  const responsePromise = page.waitForResponse(
    response =>
      response.url().includes("/admin/about.data") &&
      response.request().method() === "POST"
  );

  await page.getByRole("button", {
    name: "Enregistrer les textes et métadonnées",
    exact: true,
  }).click();

  const response = await responsePromise;
  expect(response.status()).toBe(200);

  await expect(page.getByRole("status")).toContainText(
    "Les modifications ont été enregistrées avec succès."
  );
}

test.describe("Admin About Page", () => {
  let firstImageBuffer: Buffer;
  let secondImageBuffer: Buffer;

  test.beforeAll(async () => {
    firstImageBuffer = await sharp({
      create: {
        width: 800,
        height: 1000,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    }).jpeg().toBuffer();

    secondImageBuffer = await sharp({
      create: {
        width: 800,
        height: 1000,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    }).jpeg().toBuffer();
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
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await page.getByLabel("Titre SEO (en)").fill("SEO EN Modified");
    await page.getByLabel("Titre principal (en)").fill("Hero EN Modified");
    await page.getByLabel("Texte alternatif (en)").fill("Alt EN");
    await page.getByRole("button", { name: "FR", exact: true }).click();

    // 3. Upload first image
    const uploadBtn = page.getByRole("button", { name: "Ajouter une image" });
    const fileChooserPromise = page.waitForEvent('filechooser');
    await uploadBtn.click();
    const fileChooser = await fileChooserPromise;

    const uploadResponsePromise = page.waitForResponse(response =>
      response.url().includes("/api/admin/home-image") && response.request().method() === "POST"
    );
    await fileChooser.setFiles({
      name: "about-team-1.jpg",
      mimeType: "image/jpeg",
      buffer: firstImageBuffer,
    });

    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(200);

    // Wait for upload preview
    const preview = page.getByTestId("about-image-preview-about-team");
    await expect(preview).toBeVisible({ timeout: 10000 });

    // Save
    await saveAboutPage(page);

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

    const uploadResponsePromise2 = page.waitForResponse(response =>
      response.url().includes("/api/admin/home-image") && response.request().method() === "POST"
    );
    await fileChooser2.setFiles({
      name: "about-team-2.jpg",
      mimeType: "image/jpeg",
      buffer: secondImageBuffer,
    });

    const uploadResponse2 = await uploadResponsePromise2;
    expect(uploadResponse2.status()).toBe(200);

    const preview2 = page.getByTestId("about-image-preview-about-team");
    await expect(preview2).toBeVisible({ timeout: 10000 });
    await expect(preview2).not.toHaveAttribute("src", imgSrc!);
    const newImgSrc = await preview2.getAttribute("src");
    expect(newImgSrc).toBeTruthy();

    // Save
    await saveAboutPage(page);

    // Verify old image 404
    const resOld = await request.get(imgSrc!);
    expect(resOld.status()).toBe(404);

    // Verify new image 200
    const resNew = await request.get(newImgSrc!);
    expect(resNew.status()).toBe(200);

    // 7. Delete image
    const deleteBtn = page.getByRole("button", { name: "Supprimer" });
    await deleteBtn.click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    await page.getByRole("button", { name: "Confirmer la suppression" }).click();

    await expect(modal).not.toBeVisible();
    await expect(page.getByText("Aucune image")).toBeVisible();

    await saveAboutPage(page);

    // Verify deleted image 404
    const resDeleted = await request.get(newImgSrc!);
    expect(resDeleted.status()).toBe(404);

    // Verify public page fallback
    await page.goto("/fr/a-propos");
    await expect(page.locator("picture")).not.toBeVisible();
  });
});
