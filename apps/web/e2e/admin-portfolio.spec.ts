import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';

test.describe('Admin Portfolio (Phase 3C.1)', () => {
  test.beforeEach(async ({ page }) => {
    if (process.env.PORTFOLIO_CONTENT_PATH) {
      const defaultPortfolio = {
        schemaVersion: 1,
        revision: "00000000000000000000000000000000",
        updatedAt: new Date().toISOString(),
        projects: []
      };
      fs.writeFileSync(process.env.PORTFOLIO_CONTENT_PATH, JSON.stringify(defaultPortfolio, null, 2));
    }
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

  test('should refuse to publish without media', async ({ page }) => {
    // Create new project
    await page.goto('/admin/portfolio/new');
    await page.fill('input[name="titleFr"]', 'No Media FR');
    await page.fill('input[name="titleEn"]', 'No Media EN');
    await page.fill('textarea[name="descriptionFr"]', 'Desc');
    await page.fill('textarea[name="descriptionEn"]', 'Desc');
    await page.click('button[type="submit"]');

    // Try to publish
    await page.click('a:has-text("Modifier")');
    await page.selectOption('select[name="status"]', 'published');
    await page.click('button[type="submit"]');

    // Should show error
    await expect(page.locator('[role="alert"]')).toHaveText(/Cannot publish a project without photos/);
  });
});
