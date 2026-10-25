import { test, expect } from "@playwright/test";
import { restoreDefaultSiteContent } from "./test-helpers";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
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

test.describe("Portfolio Watermark Regeneration E2E", () => {
  test.beforeEach(async () => {
    restoreDefaultSiteContent();
    validatePath(process.env.PORTFOLIO_CONTENT_PATH, "PORTFOLIO_CONTENT_PATH");
    validatePath(process.env.PORTFOLIO_MEDIA_PATH, "PORTFOLIO_MEDIA_PATH");
  });

  test("régénère le filigrane des photos existantes après modification du texte", async ({ page }) => {
    test.setTimeout(120_000);

    const contentPath = process.env.PORTFOLIO_CONTENT_PATH!;
    const mediaPath = process.env.PORTFOLIO_MEDIA_PATH!;
    validatePath(contentPath, "PORTFOLIO_CONTENT_PATH");
    validatePath(mediaPath, "PORTFOLIO_MEDIA_PATH");

    // Backup previous portfolio content for guaranteed restoration in finally
    const previousPortfolioJson = fs.existsSync(contentPath)
      ? fs.readFileSync(contentPath, "utf-8")
      : null;

    try {
      // 1. Ensure clean isolated portfolio starting state
      const initialPortfolio = {
        schemaVersion: 2,
        revision: "00000000000000000000000000000000",
        updatedAt: new Date().toISOString(),
        categories: [],
        photos: [],
        video: null,
        watermark: {
          mode: "text",
          text: "Sempra Initial",
          revision: "00000000000000000000000000000000",
          updatedAt: new Date().toISOString(),
        }
      };
      fs.writeFileSync(contentPath, JSON.stringify(initialPortfolio, null, 2), "utf-8");

      // Login as admin
      await page.goto("/admin");
      const passwordInput = page.locator('input[name="password"]');
      if (await passwordInput.isVisible()) {
        await passwordInput.fill("e2e_password");
        await page.click('button[type="submit"]');
        await expect(page.locator("h1")).toHaveText("Administration Sempra");
      }

      // 2. Configure initial watermark text on /admin/portfolio/watermark
      await page.goto("/admin/portfolio/watermark");
      await page.fill('input[name="watermarkText"]', "Sempra Premier");
      await page.click('button[type="submit"]');
      await expect(page.locator(`text="Filigrane mis à jour avec succès."`)).toBeVisible({ timeout: 10_000 });

      const updatedAfterFirstWatermark = JSON.parse(fs.readFileSync(contentPath, "utf-8"));
      const firstWatermarkRevision = updatedAfterFirstWatermark.watermark.revision;
      expect(firstWatermarkRevision).toBeTruthy();

      // 3. Import a real small test JPEG image
      const width = 800;
      const height = 600;
      const pixels = crypto.randomBytes(width * height * 3);
      const testJpegBuffer = await sharp(pixels, {
        raw: { width, height, channels: 3 },
      }).jpeg({ quality: 90 }).toBuffer();

      await page.goto("/admin/portfolio");
      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: /Uploader Photos/ }).click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles([
        { name: "test-regen-e2e.jpg", mimeType: "image/jpeg", buffer: testJpegBuffer },
      ]);

      // Wait for uploaded photo to appear
      await expect(page.locator('h2:has-text("Photos (1)")')).toBeVisible({ timeout: 30_000 });

      // 4. Verify its initial applied watermark revision and snapshot original file hash & variant bytes
      const portfolioAfterUpload = JSON.parse(fs.readFileSync(contentPath, "utf-8"));
      expect(portfolioAfterUpload.photos).toHaveLength(1);
      const photo = portfolioAfterUpload.photos[0];
      expect(photo.appliedWatermarkRevision).toBe(firstWatermarkRevision);

      const originalFilePath = path.join(
        mediaPath,
        "global-v2",
        "photos",
        photo.id,
        "originals",
        `${photo.fileId}.${photo.originalFormat}`
      );
      expect(fs.existsSync(originalFilePath)).toBe(true);
      const originalShaBefore = crypto.createHash("sha256").update(fs.readFileSync(originalFilePath)).digest("hex");

      const variant480pPath = path.join(
        mediaPath,
        "global-v2",
        "photos",
        photo.id,
        "480p",
        `${photo.fileId}-480p.webp`
      );
      expect(fs.existsSync(variant480pPath)).toBe(true);
      const initialVariantBuffer = fs.readFileSync(variant480pPath);

      // 5. Change watermark text
      await page.goto("/admin/portfolio/watermark");
      await page.fill('input[name="watermarkText"]', "Sempra Nouveau");
      await page.click('button[type="submit"]');
      await expect(page.locator(`text="Filigrane mis à jour avec succès."`)).toBeVisible({ timeout: 10_000 });

      // 6. Verify that the outdated counter shows 1 photo is outdated
      await expect(page.locator("#total-photos-count")).toHaveText("1");
      await expect(page.locator("#uptodate-photos-count")).toHaveText("0");
      await expect(page.locator("#outdated-photos-count")).toHaveText("1");

      const regenButton = page.locator("#regenerate-watermarks-button");
      await expect(regenButton).toBeEnabled();

      // Setup network capture for regenerate_one HTTP exchanges
      interface CapturedRegenExchange {
        url: string;
        method: string;
        postData: string;
        status: number;
        contentType: string | null;
      }
      const capturedExchanges: CapturedRegenExchange[] = [];
      const handleResponse = (response: import("@playwright/test").Response) => {
        const req = response.request();
        if (
          req.method() === "POST" &&
          response.url().includes("/admin/portfolio/watermark")
        ) {
          const postData = req.postData() || "";
          if (postData.includes("intent=regenerate_one")) {
            capturedExchanges.push({
              url: response.url(),
              method: req.method(),
              postData,
              status: response.status(),
              contentType: response.headers()["content-type"] || null,
            });
          }
        }
      };
      page.on("response", handleResponse);

      // 7. Launch watermark regeneration with confirmation
      page.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain("1");
        await dialog.accept();
      });
      await regenButton.click();

      // 8. Wait for processing completion
      const successLocator = page.locator("#regeneration-success-message");
      await expect(successLocator).toBeVisible({ timeout: 30_000 });
      await expect(successLocator).toHaveText(
        "Les filigranes des photos existantes ont été régénérés."
      );
      await expect(regenButton).toBeDisabled();

      page.off("response", handleResponse);

      // Verify captured HTTP exchanges:
      // - At least one POST intent=regenerate_one request was sent
      expect(capturedExchanges.length).toBeGreaterThan(0);
      for (const exchange of capturedExchanges) {
        // - Request method is strictly POST
        expect(exchange.method).toBe("POST");
        // - Request payload contains intent=regenerate_one
        expect(exchange.postData).toContain("intent=regenerate_one");
        // - Every response returns HTTP 200 (no error 4xx/5xx)
        expect(exchange.status).toBe(200);
      }

      // 9. Verify counters show all photos are up-to-date
      await expect(page.locator("#total-photos-count")).toHaveText("1");
      await expect(page.locator("#uptodate-photos-count")).toHaveText("1");
      await expect(page.locator("#outdated-photos-count")).toHaveText("0");
      await expect(page.locator("#all-photos-uptodate-message")).toBeVisible();

      // 10. Verify that the public variant has changed (different bytes)
      const newVariantBuffer = fs.readFileSync(variant480pPath);
      expect(newVariantBuffer.equals(initialVariantBuffer)).toBe(false);

      // 11. Verify that the original file has NOT changed (SHA-256 strictly identical)
      const originalShaAfter = crypto.createHash("sha256").update(fs.readFileSync(originalFilePath)).digest("hex");
      expect(originalShaAfter).toBe(originalShaBefore);

      const finalPortfolio = JSON.parse(fs.readFileSync(contentPath, "utf-8"));
      expect(finalPortfolio.photos[0].appliedWatermarkRevision).toBe(finalPortfolio.watermark.revision);
    } finally {
      // 12. Obligatory restoration of initial state in finally block
      restoreDefaultSiteContent();
      if (previousPortfolioJson) {
        fs.writeFileSync(contentPath, previousPortfolioJson, "utf-8");
      }
      if (mediaPath && fs.existsSync(mediaPath)) {
        fs.rmSync(mediaPath, { recursive: true, force: true });
        fs.mkdirSync(mediaPath, { mode: 0o700 });
      }
    }
  });
});
