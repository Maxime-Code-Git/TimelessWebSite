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

  test('should create a new draft project, edit it, preview it, and delete it', async ({ page }) => {
    // Navigate to portfolio
    await page.click('a[href="/admin/portfolio"]');
    await expect(page.locator('h1')).toHaveText('Portfolio Public');

    // Create new project
    await page.click('a[href="/admin/portfolio/new"]');
    await expect(page.locator('h1')).toHaveText('Nouveau Projet');

    await page.fill('input[name="titleFr"]', 'Test Mariage FR');
    await page.fill('input[name="titleEn"]', 'Test Wedding EN');
    await page.fill('textarea[name="descriptionFr"]', 'Desc FR');
    await page.fill('textarea[name="descriptionEn"]', 'Desc EN');

    await page.click('button[type="submit"]');

    // Redirected back to list
    await expect(page).toHaveURL('/admin/portfolio');
    await expect(page.locator('h3', { hasText: 'Test Mariage FR' })).toBeVisible();

    // Edit project
    await page.click('a:has-text("Modifier")');
    await expect(page.locator('h1')).toHaveText('Modifier le Projet');
    await expect(page.locator('input[name="titleFr"]')).toHaveValue('Test Mariage FR');

    await page.fill('input[name="titleFr"]', 'Test Mariage Modifié');
    await page.click('button[type="submit"]');

    // Redirected back to list
    await expect(page).toHaveURL('/admin/portfolio');
    await expect(page.locator('h3', { hasText: 'Test Mariage Modifié' })).toBeVisible();

    // Preview
    await page.click('a:has-text("Aperçu")');
    await expect(page.locator('h1')).toHaveText('Aperçu du Projet (Brouillon)');
    await expect(page.locator('p', { hasText: 'Test Mariage Modifié' }).first()).toBeVisible();
    await page.click('a:has-text("Retour")');

    // Delete
    page.on('dialog', dialog => dialog.accept());
    await page.click('button:has-text("Supprimer")');
    await expect(page.locator('h3', { hasText: 'Test Mariage Modifié' })).not.toBeVisible();
  });

});
