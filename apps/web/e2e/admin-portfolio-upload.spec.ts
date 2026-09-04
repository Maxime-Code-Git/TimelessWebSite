import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import sharp from "sharp";

test.describe("Admin portfolio upload and publication", () => {
  let validJpegBuffer: Buffer;

  test.beforeAll(async () => {
    const width = 800;
    const height = 600;
    const pixels = crypto.randomBytes(width * height * 3);
    validJpegBuffer = await sharp(pixels, {
      raw: { width, height, channels: 3 },
    }).jpeg({ quality: 90 }).toBuffer();
  });

  test("manages photos and exposes only a published project", async ({ page }) => {
    test.setTimeout(90_000);

    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("/admin");
    const passwordInput = page.locator('input[name="password"]');
    if (await passwordInput.isVisible()) {
      await passwordInput.fill("e2e_password");
      await page.getByRole("button", { name: "Se connecter" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Administration Sempra");
    }

    const uniqueId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const titleFr = `Projet Complet FR ${uniqueId}`;
    const titleEn = `Complete Project EN ${uniqueId}`;
    const updatedTitleFr = `${titleFr} Modifié`;
    const slugFr = `projet-complet-fr-${uniqueId}`;
    const slugEn = `complete-project-en-${uniqueId}`;

    await page.locator('a[href="/admin/portfolio"]').click();
    await page.locator('a[href="/admin/portfolio/new"]').click();
    await page.fill('input[name="titleFr"]', titleFr);
    await page.fill('input[name="titleEn"]', titleEn);
    await page.fill('textarea[name="descriptionFr"]', "Desc FR complète");
    await page.fill('textarea[name="descriptionEn"]', "Complete EN description");
    await expect(page.getByText(`/fr/portfolio/${slugFr}`, { exact: false })).toBeVisible();
    await expect(page.getByText(`/en/portfolio/${slugEn}`, { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Créer le brouillon" }).click();

    await expect(page).toHaveURL("/admin/portfolio");
    const dashboardCard = page.locator("li", {
      has: page.getByRole("heading", { name: `${titleFr} / ${titleEn}` }),
    });
    await dashboardCard.getByRole("link", { name: "Modifier" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Modifier le Projet");

    const uploadUrl = `${page.url()}/upload`;
    for (const method of ["get", "put", "patch", "delete"] as const) {
      const response = await page.request[method](uploadUrl);
      expect(response.status()).toBe(405);
      expect(response.headers().allow).toBe("POST");
    }

    const publishButton = page.getByRole("button", { name: "Publier le projet" });
    await expect(publishButton).toBeDisabled();

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Sélectionner des photos/ }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([
      { name: "photo1.jpg", mimeType: "image/jpeg", buffer: validJpegBuffer },
      { name: "photo2.jpg", mimeType: "image/jpeg", buffer: validJpegBuffer },
    ]);

    const photoCards = page.locator('div[class*="photoCard"]');
    await expect(photoCards).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator('div[class*="error"]')).toHaveCount(0);

    const adminImages = page.locator('img[src*="/admin/portfolio/media/"]');
    await expect(adminImages).toHaveCount(2);
    const firstAdminImageUrl = await adminImages.first().getAttribute("src");
    expect(firstAdminImageUrl).not.toBeNull();

    const adminMediaResponse = await page.request.get(firstAdminImageUrl!);
    expect(adminMediaResponse.status()).toBe(200);
    expect(adminMediaResponse.headers()["content-type"]).toBe("image/webp");
    expect(adminMediaResponse.headers()["cache-control"]).toBe("no-store, max-age=0");
    expect(adminMediaResponse.headers()["x-content-type-options"]).toBe("nosniff");
    expect(adminMediaResponse.headers()["x-robots-tag"]).toBe("noindex, nofollow");

    const originalResponse = await page.request.get(firstAdminImageUrl!.replace("480p", "original"));
    expect(originalResponse.status()).toBe(404);

    const anonymousContext = await page.context().browser()!.newContext();
    const anonymousPage = await anonymousContext.newPage();
    const anonymousAdminMediaResponse = await anonymousPage.goto(new URL(firstAdminImageUrl!, page.url()).toString());
    expect(anonymousAdminMediaResponse?.status()).toBe(401);

    const coverBadge = page.locator("span").filter({ hasText: /^Couverture$/ });
    await expect(photoCards.filter({ has: coverBadge })).toHaveCount(1);
    const secondPhotoUrl = await adminImages.nth(1).getAttribute("src");
    await photoCards.nth(1).getByRole("button", { name: "Couverture" }).click();
    const coverCard = photoCards.filter({ has: coverBadge });
    await expect(coverCard.locator("img")).toHaveAttribute("src", secondPhotoUrl!);

    const firstPhotoCard = photoCards.nth(0);
    await firstPhotoCard.getByRole("button", { name: "Modifier" }).click();
    await firstPhotoCard.locator("select").selectOption("ceremony");
    await firstPhotoCard.getByPlaceholder("Alt FR").fill("Alt FR 1");
    await firstPhotoCard.getByPlaceholder("Alt EN").fill("Alt EN 1");
    await firstPhotoCard.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(firstPhotoCard.getByText("ceremony", { exact: true })).toBeVisible();
    await expect(firstPhotoCard.getByText("Alt FR 1", { exact: true })).toBeVisible();

    const secondPhotoCard = photoCards.nth(1);
    await secondPhotoCard.getByRole("button", { name: "Modifier" }).click();
    await secondPhotoCard.locator("select").selectOption("reception");
    await secondPhotoCard.getByPlaceholder("Alt FR").fill("Alt FR 2");
    await secondPhotoCard.getByPlaceholder("Alt EN").fill("Alt EN 2");
    await secondPhotoCard.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(secondPhotoCard.getByText("reception", { exact: true })).toBeVisible();

    await expect(photoCards.nth(0).locator("strong")).toHaveText("ceremony");
    await photoCards.nth(0).getByRole("button", { name: "Descendre" }).click();
    await expect(photoCards.nth(0).locator("strong")).toHaveText("reception");

    await page.fill('input[name="titleFr"]', updatedTitleFr);
    await page.fill('input[name="videoUrl"]', 'https://vimeo.com/76979871');

    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(page.locator('input[name="titleFr"]')).toHaveValue(updatedTitleFr);

    await expect(publishButton).toBeEnabled();
    await publishButton.click();
    await expect(page).toHaveURL("/admin/portfolio");
    const publishedCard = page.locator("li", {
      has: page.getByRole("heading", { name: `${updatedTitleFr} / ${titleEn}` }),
    });
    await expect(publishedCard.getByText("published", { exact: true })).toBeVisible();

    let externalRequests = 0;
    await anonymousPage.route("**/*", route => {
      const url = route.request().url();
      if (url.includes("vimeo.com") || url.includes("youtube.com")) {
        externalRequests++;
        return route.fulfill({ status: 200, body: "simulated-video", contentType: "text/html" });
      }
      return route.continue();
    });

    const portfolioResponse = await anonymousPage.goto("/fr/portfolio");
    expect(portfolioResponse?.status()).toBe(200);

    const csp = portfolioResponse?.headers()["content-security-policy"] || "";
    expect(csp).toContain("frame-src https://www.youtube-nocookie.com https://player.vimeo.com");

    const inlineStyles = await anonymousPage.locator("[style]").count();
    expect(inlineStyles).toBe(0);

    await expect(anonymousPage.locator('a[href="#galerie-video"]')).toBeVisible();

    // Avant le clic : aucune iframe, aucune requête
    await expect(anonymousPage.locator('iframe')).toHaveCount(0);
    expect(externalRequests).toBe(0);

    const requestPromise = anonymousPage.waitForRequest(req => req.url().includes("vimeo.com") || req.url().includes("youtube.com"));
    await anonymousPage.locator('button[aria-label="Lire la vidéo"]').first().click();

    // Après le clic : iframe présente et requête lancée
    await requestPromise;
    await expect(anonymousPage.locator('iframe[src*="player.vimeo.com/video/76979871"]')).toBeVisible();
    expect(externalRequests).toBeGreaterThan(0);
    await expect(anonymousPage.getByRole("link", { name: updatedTitleFr })).toBeVisible();
    await anonymousPage.getByRole("link", { name: updatedTitleFr }).click();
    await expect(anonymousPage).toHaveURL(`/fr/portfolio/${slugFr}`);
    await expect(anonymousPage.getByRole("heading", { name: updatedTitleFr })).toBeVisible();
    await expect(anonymousPage.locator('img[src*="/portfolio/media/"]')).toHaveCount(2);
    const publicImageUrl = await anonymousPage.locator('img[src*="/portfolio/media/"]').first().getAttribute("src");
    expect(publicImageUrl).not.toBeNull();
    const publicMediaResponse = await anonymousPage.request.get(publicImageUrl!);
    expect(publicMediaResponse.status()).toBe(200);
    expect(publicMediaResponse.headers()["content-type"]).toBe("image/webp");
    expect(publicMediaResponse.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");

    await anonymousPage.goto("/en/portfolio");
    await expect(anonymousPage.getByRole("link", { name: titleEn })).toBeVisible();
    await anonymousPage.getByRole("link", { name: titleEn }).click();
    await expect(anonymousPage).toHaveURL(`/en/portfolio/${slugEn}`);
    await expect(anonymousPage.getByRole("heading", { name: titleEn })).toBeVisible();

    await publishedCard.getByRole("link", { name: "Modifier" }).click();
    await page.getByRole("button", { name: "Repasser en brouillon" }).click();
    await expect(page).toHaveURL("/admin/portfolio");
    const draftCard = page.locator("li", {
      has: page.getByRole("heading", { name: `${updatedTitleFr} / ${titleEn}` }),
    });
    await expect(draftCard.getByText("draft", { exact: true })).toBeVisible();

    const hiddenProjectResponse = await anonymousPage.goto(`/fr/portfolio/${slugFr}`);
    expect(hiddenProjectResponse?.status()).toBe(404);
    const hiddenMediaResponse = await anonymousPage.request.get(publicImageUrl!);
    expect(hiddenMediaResponse.status()).toBe(404);
    await anonymousContext.close();

    await draftCard.getByRole("link", { name: "Modifier" }).click();
    const currentCards = page.locator('div[class*="photoCard"]');
    let coverWarning = "";
    page.once("dialog", async dialog => {
      coverWarning = dialog.message();
      await dialog.accept();
    });
    await currentCards.filter({ has: coverBadge })
      .getByRole("button", { name: "Supprimer" }).click();
    expect(coverWarning).toContain("Impossible de supprimer la photo de couverture");

    page.once("dialog", dialog => dialog.accept());
    await currentCards.filter({ has: page.getByRole("button", { name: "Couverture" }) })
      .getByRole("button", { name: "Supprimer" }).click();
    await expect(currentCards).toHaveCount(1);
    expect(pageErrors).toEqual([]);
  });
});
