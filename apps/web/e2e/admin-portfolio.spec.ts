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

test.describe('Admin Portfolio (Phase 3C.1)', () => {
  test.beforeEach(async ({ page }) => {
    validatePath(process.env.PORTFOLIO_CONTENT_PATH, 'PORTFOLIO_CONTENT_PATH');
    validatePath(process.env.PORTFOLIO_MEDIA_PATH, 'PORTFOLIO_MEDIA_PATH');
    const defaultPortfolio = {
      schemaVersion: 1,
      revision: "00000000000000000000000000000000",
      updatedAt: new Date().toISOString(),
      projects: []
    };
    fs.writeFileSync(process.env.PORTFOLIO_CONTENT_PATH!, JSON.stringify(defaultPortfolio, null, 2));
    // 1. Login
    await page.goto('/admin');
    const passwordInput = page.locator('input[name="password"]');
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('e2e_password');
      await page.click('button[type="submit"]');
      await expect(page.locator('h1')).toHaveText('Administration Timeless');
    }
  });

  test('should display portfolio dashboard link', async ({ page }) => {
    const portfolioLink = page.locator('a[href="/admin/portfolio"]');
    await expect(portfolioLink).toBeVisible();
    await expect(portfolioLink).toHaveText(/Portfolio public/);
  });

  test('should completely manage draft projects and respect constraints', async ({ page, context }) => {
    // 1. Create first project
    await page.click('a[href="/admin/portfolio"]');
    await page.click('a[href="/admin/portfolio/new"]');
    
    // Check no publish option
    await expect(page.locator('input[name="published"]')).not.toBeVisible();

    await page.fill('input[name="titleFr"]', 'Test Mariage FR');
    await page.fill('input[name="titleEn"]', 'Test Wedding EN');
    await page.fill('textarea[name="descriptionFr"]', 'Desc FR');
    await page.fill('textarea[name="descriptionEn"]', 'Desc EN');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/admin/portfolio');
    await expect(page.locator('h3', { hasText: 'Test Mariage FR / Test Wedding EN' })).toBeVisible();

    // 2. Slugs automatiques and check headers
    await page.click('a:has-text("Modifier")');
    await expect(page.locator('input[name="slugFr"]')).toHaveValue('test-mariage-fr');
    await expect(page.locator('input[name="slugEn"]')).toHaveValue('test-wedding-en');

    // 3. Create second project with same title to test slug suffix
    await page.click('a:has-text("Retour")');
    await page.click('a[href="/admin/portfolio/new"]');
    await page.fill('input[name="titleFr"]', 'Test Mariage FR');
    await page.fill('input[name="titleEn"]', 'Test Wedding EN');
    await page.fill('textarea[name="descriptionFr"]', 'Desc 2');
    await page.fill('textarea[name="descriptionEn"]', 'Desc 2');
    await page.click('button[type="submit"]');

    const modifyLinks = page.locator('a:has-text("Modifier")');
    await modifyLinks.last().click();
    await expect(page.locator('input[name="slugFr"]')).toHaveValue('test-mariage-fr-1');
    await expect(page.locator('input[name="slugEn"]')).toHaveValue('test-wedding-en-1');
    
    // Change the title to make it distinct for reordering tests
    await page.fill('input[name="titleFr"]', 'Test Mariage FR 2');
    await page.click('button[type="submit"]');

    // Wait for dashboard and verify order
    await expect(page.locator('h3').first()).toHaveText('Test Mariage FR / Test Wedding EN');
    await expect(page.locator('h3').nth(1)).toHaveText('Test Mariage FR 2 / Test Wedding EN');

    // 4. Reorder projects
    // Wait for buttons
    const upButtons = page.locator('button:has-text("Monter")');
    const downButtons = page.locator('button:has-text("Descendre")');
    
    // First item cannot go up
    await expect(upButtons.first()).toBeDisabled();
    // Second item cannot go down
    await expect(downButtons.nth(1)).toBeDisabled();

    // Move second item up
    await upButtons.nth(1).click();
    // After reload, first item should be the one we just moved
    await expect(page.locator('h3').first()).toHaveText('Test Mariage FR 2 / Test Wedding EN');
    await expect(page.locator('h3').nth(1)).toHaveText('Test Mariage FR / Test Wedding EN');
    
    // 5. Aperçu authentifié
    await page.locator('a:has-text("Aperçu")').first().click();
    await expect(page.locator('h1')).toHaveText('Aperçu du Projet (Brouillon)');
    const res = await page.request.get(page.url());
    expect(res.headers()['cache-control']).toContain('no-store');
    expect(res.headers()['x-robots-tag']).toContain('noindex, nofollow');
    
    const previewUrl = page.url();

    // 6. Tentative anonyme d'aperçu -> redirection
    const anonContext = await context.browser()!.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(previewUrl);
    await expect(anonPage).toHaveURL(/.*\/admin/);
    await anonContext.close();

    // 7. Pages publiques ne contiennent pas les brouillons
    await page.goto('/fr/portfolio');
    await expect(page.locator('body')).not.toContainText('Test Mariage FR');
    await page.goto('/en/portfolio');
    await expect(page.locator('body')).not.toContainText('Test Wedding EN');

    // 8. Delete projects
    await page.goto('/admin/portfolio');
    page.on('dialog', dialog => dialog.accept());
    await page.locator('button:has-text("Supprimer")').first().click();
    await page.locator('button:has-text("Supprimer")').first().click();
    await expect(page.locator('h3')).toHaveCount(0);
  });

});
