import { expect, test } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";

function validatePath(val: string | undefined, name: string) {
  if (!val) throw new Error(`${name} is required`);
  const resolved = path.resolve(val);
  const tmp = os.tmpdir();
  const relTmp = path.relative(tmp, resolved);
  if (relTmp.startsWith("..") || path.isAbsolute(relTmp)) throw new Error("Must be under os.tmpdir()");
  const dirName = path.dirname(resolved).split(path.sep).pop() || "";
  if (!dirName.startsWith("timeless-e2e-")) throw new Error("Must be under timeless-e2e-");
  const forbidden = ["data", "public", "build"].map(d => path.join(process.cwd(), d));
  for (const f of forbidden) {
    const rel = path.relative(f, resolved);
    if (!rel.startsWith("..") && !path.isAbsolute(rel)) throw new Error("Forbidden path " + f);
  }
}

test.describe("Admin portfolio upload and publication V2", () => {
  let validJpegBuffer: Buffer;

  test.beforeAll(async () => {
    const width = 800;
    const height = 600;
    const pixels = crypto.randomBytes(width * height * 3);
    validJpegBuffer = await sharp(pixels, {
      raw: { width, height, channels: 3 },
    }).jpeg({ quality: 90 }).toBuffer();
  });

  test.beforeEach(async () => {
    const contentPath = process.env.PORTFOLIO_CONTENT_PATH;
    const mediaPath = process.env.PORTFOLIO_MEDIA_PATH;
    validatePath(contentPath, "PORTFOLIO_CONTENT_PATH");
    validatePath(mediaPath, "PORTFOLIO_MEDIA_PATH");

    // Clean up the media folder completely
    if (fs.existsSync(mediaPath!)) {
      fs.rmSync(mediaPath!, { recursive: true, force: true });
    }
    fs.mkdirSync(mediaPath!, { recursive: true });

    // Reset portfolio to clean state before each test
    const defaultPortfolio = {
      schemaVersion: 2,
      revision: "00000000000000000000000000000000",
      updatedAt: new Date().toISOString(),
      categories: [],
      photos: [],
      video: null,
      watermark: { mode: "text", text: "Sempra", revision: "00000000000000000000000000000000", updatedAt: new Date().toISOString() }
    };
    fs.writeFileSync(contentPath!, JSON.stringify(defaultPortfolio, null, 2));
  });

  test.afterEach(async () => {
    // Only cleanup files, don't remove env vars or directory containing them
    const mediaPath = process.env.PORTFOLIO_MEDIA_PATH;
    if (mediaPath && fs.existsSync(mediaPath)) {
      fs.rmSync(mediaPath, { recursive: true, force: true });
    }
  });

  test("manages photos in global portfolio", async ({ page }) => {
    test.setTimeout(90_000);

    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    // Login
    await page.goto("/admin");
    const passwordInput = page.locator('input[name="password"]');
    if (await passwordInput.isVisible()) {
      await passwordInput.fill("e2e_password");
      await page.getByRole("button", { name: "Se connecter" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Administration Sempra");
    }

    await page.locator('a[href="/admin/portfolio"]').click();
    await expect(page).toHaveURL("/admin/portfolio");

    // Upload photos
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Uploader Photos/ }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([
      { name: "photo1.jpg", mimeType: "image/jpeg", buffer: validJpegBuffer },
      { name: "photo2.jpg", mimeType: "image/jpeg", buffer: validJpegBuffer },
    ]);

    // Wait for uploads to complete
    await expect(page.locator('h2:has-text("Photos (2)")')).toBeVisible({ timeout: 30_000 });

    const adminImages = page.locator('img[src*="/admin/portfolio/media/"][src$="/480p"]');
    await expect(adminImages).toHaveCount(2);
    const adminThumbImages = page.locator('img[src*="admin-thumb"]');
    await expect(adminThumbImages).toHaveCount(0);

    for (let i = 0; i < 2; i++) {
      const img = adminImages.nth(i);
      await expect(img).toBeVisible();
      await expect(async () => {
        const size = await img.evaluate((el: HTMLImageElement) => ({ width: el.naturalWidth, height: el.naturalHeight }));
        expect(size.width).toBeGreaterThan(0);
        expect(size.height).toBeGreaterThan(0);
      }).toPass();
    }

    const firstPhotoEdit = page.locator('div[class*="photoItem"]').first();
    await firstPhotoEdit.getByRole("button", { name: "Edit" }).click();
    await firstPhotoEdit.getByPlaceholder("Ex. Les mariés").fill("Alt FR 1");
    await firstPhotoEdit.getByPlaceholder("E.g. The couple").fill("Alt EN 1");

    await page.fill('input[placeholder="Nom FR"]', 'Test Cat FR');
    await page.fill('input[placeholder="Nom EN"]', 'Test Cat EN');
    await page.fill('input[placeholder="Slug"]', 'test-cat');
    await page.click('button:has-text("Ajouter Catégorie")');
    await expect(page.locator('strong:has-text("Test Cat FR")')).toBeVisible({ timeout: 5000 });

    await firstPhotoEdit.locator("select").selectOption({ label: "Test Cat FR" });
    await firstPhotoEdit.getByRole("button", { name: "OK", exact: true }).click();
    await expect(firstPhotoEdit.getByRole("button", { name: "OK", exact: true })).not.toBeVisible({ timeout: 5000 });

    await firstPhotoEdit.getByRole("button", { name: "Afficher" }).click();
    await expect(firstPhotoEdit.getByRole("button", { name: "Masquer" })).toBeVisible({ timeout: 5000 });
    await expect(firstPhotoEdit.getByText("Test Cat FR")).toBeVisible();

    const anonymousContext = await page.context().browser()!.newContext();
    const anonymousPage = await anonymousContext.newPage();
    const portfolioResponse = await anonymousPage.goto("/fr/portfolio");
    expect(portfolioResponse?.status()).toBe(200);

    await expect(anonymousPage.locator('img[src*="/portfolio/media/"]')).toHaveCount(1);
    const publicImageUrl = await anonymousPage.locator('img[src*="/portfolio/media/"]').first().getAttribute("src");
    expect(publicImageUrl).not.toBeNull();

    const firstImgSrc = await page.locator('div[class*="photoItem"]').first().locator('img').getAttribute("src");
    const secondImgSrc = await page.locator('div[class*="photoItem"]').nth(1).locator('img').getAttribute("src");

    await page.locator('div[class*="photoItem"]').first().getByRole("button", { name: "▶" }).click();

    await expect(page.locator('div[class*="photoItem"]').first().locator('img')).toHaveAttribute("src", secondImgSrc as string);
    await expect(page.locator('div[class*="photoItem"]').nth(1).locator('img')).toHaveAttribute("src", firstImgSrc as string);

    // First delete
    await page.locator('div[class*="photoItem"]').first().getByRole("button", { name: "Del" }).click();
    const ouiBtn1 = page.locator('div[class*="photoItem"]').first().getByRole("button", { name: "Oui" });
    await expect(ouiBtn1).toBeVisible();
    await expect(ouiBtn1).toBeEnabled();
    await ouiBtn1.click();
    await expect(page.locator('h2:has-text("Photos (1)")')).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.locator('h2:has-text("Photos (1)")')).toBeVisible({ timeout: 5_000 });

    // Second delete
    await page.locator('div[class*="photoItem"]').first().getByRole("button", { name: "Del" }).click();
    const ouiBtn2 = page.locator('div[class*="photoItem"]').first().getByRole("button", { name: "Oui" });
    await expect(ouiBtn2).toBeVisible();
    await expect(ouiBtn2).toBeEnabled();
    await ouiBtn2.click();
    await expect(page.locator('h2:has-text("Photos (0)")')).toBeVisible({ timeout: 10_000 });

    await anonymousPage.reload();
    await expect(anonymousPage.locator('img[src*="/portfolio/media/"]')).toHaveCount(0);

    await anonymousContext.close();
    expect(pageErrors).toEqual([]);
  });
});
