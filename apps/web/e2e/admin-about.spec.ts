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
      create: { width: 800, height: 1000, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).jpeg().toBuffer();

    secondImageBuffer = await sharp({
      create: { width: 800, height: 1000, channels: 3, background: { r: 0, g: 255, b: 0 } },
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

  test("can edit texts and upload images for multiple profiles, verify on public pages", async ({ page, request }) => {
    // 1. Edit FR texts
    await page.getByLabel("Titre SEO (fr)").fill("SEO FR Modifié");
    await page.getByLabel("Titre principal (fr)").fill("Hero FR Modifié");

    const photoCard = page.getByTestId("about-team-member-photographer");
    const videoCard = page.getByTestId("about-team-member-videographer");

    await photoCard.locator("label:has-text('Texte alternatif (fr)')").locator("..").locator("input").fill("Alt Photo FR");
    await videoCard.locator("label:has-text('Texte alternatif (fr)')").locator("..").locator("input").fill("Alt Video FR");

    // 2. Edit EN texts
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await page.getByLabel("Titre SEO (en)").fill("SEO EN Modified");
    await page.getByLabel("Titre principal (en)").fill("Hero EN Modified");

    await photoCard.locator("label:has-text('Texte alternatif (en)')").locator("..").locator("input").fill("Alt Photo EN");
    await videoCard.locator("label:has-text('Texte alternatif (en)')").locator("..").locator("input").fill("Alt Video EN");
    await page.getByRole("button", { name: "FR", exact: true }).click();

    // 3. Upload first image for photographer
    const uploadPhotoBtn = photoCard.getByRole("button", { name: "Ajouter une image" });
    const fileChooserPromisePhoto = page.waitForEvent('filechooser');
    await uploadPhotoBtn.click();
    const fileChooserPhoto = await fileChooserPromisePhoto;

    const uploadResponsePromisePhoto = page.waitForResponse(res => res.url().includes("/api/admin/home-image") && res.request().method() === "POST");
    await fileChooserPhoto.setFiles({ name: "photographer.jpg", mimeType: "image/jpeg", buffer: firstImageBuffer });
    const uploadResponsePhoto = await uploadResponsePromisePhoto;

    const bodyPhoto = await uploadResponsePhoto.text();
    expect(uploadResponsePhoto.status(), `POST failed with status ${uploadResponsePhoto.status()} - Body: ${bodyPhoto}`).toBe(200);

    const previewPhoto = page.getByTestId("about-image-preview-photographer");
    await expect(previewPhoto).toBeVisible({ timeout: 10000 });
    const photoSrc = await previewPhoto.getAttribute("src");
    expect(photoSrc).toBeTruthy();

    // 4. Upload second image for videographer
    const uploadVideoBtn = videoCard.getByRole("button", { name: "Ajouter une image" });
    const fileChooserPromiseVideo = page.waitForEvent('filechooser');
    await uploadVideoBtn.click();
    const fileChooserVideo = await fileChooserPromiseVideo;

    const uploadResponsePromiseVideo = page.waitForResponse(res => res.url().includes("/api/admin/home-image") && res.request().method() === "POST");
    await fileChooserVideo.setFiles({ name: "videographer.jpg", mimeType: "image/jpeg", buffer: secondImageBuffer });
    const uploadResponseVideo = await uploadResponsePromiseVideo;

    const bodyVideo = await uploadResponseVideo.text();
    expect(uploadResponseVideo.status(), `POST failed with status ${uploadResponseVideo.status()} - Body: ${bodyVideo}`).toBe(200);

    const previewVideo = page.getByTestId("about-image-preview-videographer");
    await expect(previewVideo).toBeVisible({ timeout: 10000 });
    const videoSrc = await previewVideo.getAttribute("src");
    expect(videoSrc).toBeTruthy();

    // Save
    await saveAboutPage(page);

    // Verify HTTP 200 for both
    const resPhoto = await request.get(photoSrc!);
    expect(resPhoto.status()).toBe(200);
    const resVideo = await request.get(videoSrc!);
    expect(resVideo.status()).toBe(200);

    // 5. Verify public page FR
    await page.goto("/fr/a-propos");
    await expect(page.locator("h1")).toContainText("Hero FR Modifié");
    await expect(page).toHaveTitle("SEO FR Modifié");

    const pubPhotoFr = page.locator("#photographer picture img");
    await expect(pubPhotoFr).toHaveAttribute("alt", "Alt Photo FR");
    await expect(pubPhotoFr).toBeVisible();

    const pubVideoFr = page.locator("#videographer picture img");
    await expect(pubVideoFr).toHaveAttribute("alt", "Alt Video FR");
    await expect(pubVideoFr).toBeVisible();

    // 6. Verify public page EN
    await page.goto("/en/about");
    await expect(page.locator("h1")).toContainText("Hero EN Modified");
    await expect(page).toHaveTitle("SEO EN Modified");

    const pubPhotoEn = page.locator("#photographer picture img");
    await expect(pubPhotoEn).toHaveAttribute("alt", "Alt Photo EN");
    await expect(pubPhotoEn).toBeVisible();

    const pubVideoEn = page.locator("#videographer picture img");
    await expect(pubVideoEn).toHaveAttribute("alt", "Alt Video EN");
    await expect(pubVideoEn).toBeVisible();

    // 7. Replace ONLY photographer image
    await page.goto("/admin/about");
    const photoCard2 = page.getByTestId("about-team-member-photographer");

    const replacePhotoBtn = photoCard2.getByRole("button", { name: "Remplacer l'image" });
    const fileChooserPromisePhoto2 = page.waitForEvent('filechooser');
    await replacePhotoBtn.click();
    const fileChooserPhoto2 = await fileChooserPromisePhoto2;

    const uploadResponsePromisePhoto2 = page.waitForResponse(res => res.url().includes("/api/admin/home-image") && res.request().method() === "POST");
    await fileChooserPhoto2.setFiles({ name: "photographer-new.jpg", mimeType: "image/jpeg", buffer: secondImageBuffer });
    const uploadResponsePhoto2 = await uploadResponsePromisePhoto2;

    const bodyPhoto2 = await uploadResponsePhoto2.text();
    expect(uploadResponsePhoto2.status(), `POST failed with status ${uploadResponsePhoto2.status()} - Body: ${bodyPhoto2}`).toBe(200);

    const previewPhoto2 = page.getByTestId("about-image-preview-photographer");
    await expect(previewPhoto2).toBeVisible({ timeout: 10000 });
    await expect(previewPhoto2).not.toHaveAttribute("src", photoSrc!);

    const newPhotoSrc = await previewPhoto2.getAttribute("src");
    expect(newPhotoSrc).toBeTruthy();

    // Verify videographer image is intact
    const previewVideo2 = page.getByTestId("about-image-preview-videographer");
    await expect(previewVideo2).toHaveAttribute("src", videoSrc!);

    // Save
    await saveAboutPage(page);

    // Verify old photographer image 404
    const resOldPhoto = await request.get(photoSrc!);
    expect(resOldPhoto.status()).toBe(404);

    // Verify new photographer image 200
    const resNewPhoto = await request.get(newPhotoSrc!);
    expect(resNewPhoto.status()).toBe(200);

    // Verify videographer image still 200
    const resOldVideo = await request.get(videoSrc!);
    expect(resOldVideo.status()).toBe(200);

    // 8. Delete ONLY photographer image
    const deletePhotoBtn = photoCard2.getByRole("button", { name: "Supprimer" });
    await deletePhotoBtn.click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await page.getByRole("button", { name: "Confirmer la suppression" }).click();
    await expect(modal).not.toBeVisible();

    await expect(photoCard2.getByText("Aucune image")).toBeVisible();
    await expect(previewVideo2).toBeVisible(); // Videographer image still there

    await saveAboutPage(page);

    // Verify deleted photographer image 404
    const resDeletedPhoto = await request.get(newPhotoSrc!);
    expect(resDeletedPhoto.status()).toBe(404);

    // Verify public page fallback
    await page.goto("/fr/a-propos");
    await expect(page.locator("#photographer picture")).not.toBeVisible();
    await expect(page.locator("#videographer picture img")).toBeVisible();
  });
});
