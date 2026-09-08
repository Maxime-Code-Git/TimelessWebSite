import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function validatePath(val: string | undefined, name: string) {
  if (!val) throw new Error(`${name} is required`);
  const resolved = path.resolve(val);
  const tmp = os.tmpdir();
  const relTmp = path.relative(tmp, resolved);
  if (relTmp.startsWith('..') || path.isAbsolute(relTmp)) throw new Error('Must be under os.tmpdir()');
  const dirName = path.dirname(resolved).split(path.sep).pop() || '';
  if (!dirName.startsWith('timeless-e2e-')) throw new Error('Must be under timeless-e2e-');
  const forbidden = ['data', 'public', 'build'].map(d => path.join(process.cwd(), d));
  for (const f of forbidden) {
    const rel = path.relative(f, resolved);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) throw new Error('Forbidden path ' + f);
  }
}

test.describe('Admin Portfolio V2', () => {
  test.beforeEach(async ({ page }) => {
    validatePath(process.env.PORTFOLIO_CONTENT_PATH, 'PORTFOLIO_CONTENT_PATH');
    validatePath(process.env.PORTFOLIO_MEDIA_PATH, 'PORTFOLIO_MEDIA_PATH');
    const defaultPortfolio = {
      schemaVersion: 2,
      revision: "00000000000000000000000000000000",
      updatedAt: new Date().toISOString(),
      categories: [],
      photos: [],
      video: null,
      watermark: { mode: "text", text: "Sempra", revision: "00000000000000000000000000000000", updatedAt: new Date().toISOString() }
    };
    fs.writeFileSync(process.env.PORTFOLIO_CONTENT_PATH!, JSON.stringify(defaultPortfolio, null, 2));

    // Login
    await page.goto('/admin');
    const passwordInput = page.locator('input[name="password"]');
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('e2e_password');
      await page.click('button[type="submit"]');
      await expect(page.locator('h1')).toHaveText('Administration Sempra');
    }
  });

  test('should display portfolio dashboard link', async ({ page }) => {
    const portfolioLink = page.locator('a[href="/admin/portfolio"]');
    await expect(portfolioLink).toBeVisible();
    await expect(portfolioLink).toHaveText(/Portfolio public/);
  });

  test('should manage global video', async ({ page }) => {
    await page.goto('/admin/portfolio');
    await page.fill('input[name="videoUrl"]', 'https://vimeo.com/76979871');
    await page.click('button:has-text("Enregistrer Vidéo")');

    const deleteButton = page.locator('button:has-text("Supprimer")');
    await expect(deleteButton).toBeVisible({ timeout: 10000 });

    await deleteButton.click();
    await expect(page.locator('input[name="videoUrl"]')).toHaveValue('');
  });

  test('should completely manage categories and respect constraints', async ({ page }) => {
    await page.goto('/admin/portfolio');

    // 1. Create first category — the creation form uses input[name="nameFr"] etc.
    await page.fill('input[placeholder="Nom FR"]', 'Catégorie 1 FR');
    await page.fill('input[placeholder="Nom EN"]', 'Category 1 EN');
    await page.fill('input[placeholder="Slug"]', 'cat-1');
    await page.click('button:has-text("Ajouter Catégorie")');

    // After creation, the category appears in read mode as <strong>
    await expect(page.locator('strong:has-text("Catégorie 1 FR")')).toBeVisible({ timeout: 5000 });

    // 2. Create second category
    await page.fill('input[placeholder="Nom FR"]', 'Catégorie 2 FR');
    await page.fill('input[placeholder="Nom EN"]', 'Category 2 EN');
    await page.fill('input[placeholder="Slug"]', 'cat-2');
    await page.click('button:has-text("Ajouter Catégorie")');

    await expect(page.locator('strong:has-text("Catégorie 2 FR")')).toBeVisible({ timeout: 5000 });

    // 3. Reorder categories
    const upButtons = page.locator('button:has-text("▲")');
    const downButtons = page.locator('button:has-text("▼")');

    // Wait for arrow buttons to appear (2 categories → 2 up + 2 down buttons)
    await expect(upButtons).toHaveCount(2, { timeout: 5000 });

    // First item cannot go up
    await expect(upButtons.first()).toBeDisabled();
    // Second item cannot go down
    await expect(downButtons.nth(1)).toBeDisabled();

    // Move second item up
    await upButtons.nth(1).click();

    // After reorder, "Catégorie 2 FR" should now be first (toHaveText will auto-wait)
    const categoryItems = page.locator('div[class*="categoryItem"]');
    await expect(categoryItems.first().locator('strong')).toHaveText(/Catégorie 2 FR/);

    // 4. Update category
    await page.locator('button:has-text("Modifier")').first().click();
    const editInputFr = page.locator('input[placeholder="Nom (FR)"]').first();
    await expect(editInputFr).toBeVisible({ timeout: 5000 });
    await editInputFr.fill('Catégorie 2 FR Modifiée');
    await page.locator('button:has-text("Sauvegarder")').first().click();

    // Wait for save to complete
    await expect(page.locator('button:has-text("Sauvegarder")')).not.toBeVisible({ timeout: 5000 });
    await page.reload();
    await expect(page.locator('strong:has-text("Catégorie 2 FR Modifiée")')).toBeVisible({ timeout: 5000 });

    // 5. Public page categories visibility check
    const publicFr = await page.goto('/fr/portfolio');
    expect(publicFr?.status()).toBe(200);

    // 6. Delete categories
    await page.goto('/admin/portfolio');
    await expect(page.locator('strong:has-text("Catégorie 2 FR Modifiée")')).toBeVisible({ timeout: 5000 });
    await page.locator('button:has-text("Supprimer")').first().click();
    await page.locator('button:has-text("Oui, supprimer")').first().click();
    await expect(page.locator('button:has-text("Oui, supprimer")')).not.toBeVisible({ timeout: 5000 });

    // It should now only have 1 category left. Delete the other one.
    await page.locator('button:has-text("Supprimer")').first().click();
    await page.locator('button:has-text("Oui, supprimer")').first().click();
    await expect(page.locator('button:has-text("Oui, supprimer")')).not.toBeVisible();

    // Verification that categories are deleted — heading shows (0)
    await expect(page.locator('h2:has-text("Catégories (0)")')).toBeVisible();
  });

  test('old portfolio URLs should redirect to global portfolio', async ({ request }) => {
    const responseFr = await request.get('/fr/portfolio/old-slug', { maxRedirects: 0 });
    expect(responseFr.status()).toBe(301);
    expect(responseFr.headers()['location']).toBe('/fr/portfolio');

    const responseEn = await request.get('/en/portfolio/old-slug', { maxRedirects: 0 });
    expect(responseEn.status()).toBe(301);
    expect(responseEn.headers()['location']).toBe('/en/portfolio');
  });

});
