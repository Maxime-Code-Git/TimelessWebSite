import { test, expect } from '@playwright/test';
import { restoreDefaultSiteContent } from './test-helpers';

test.describe('Admin Legal Pages', () => {
  test('can modify draft, check public page independence, publish, and check history', async ({ page }, testInfo) => {
    test.setTimeout(60_000);

    const suffix = `${testInfo.project.name}-${testInfo.retry}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const baselineTitleFR = `Version initiale E2E ${suffix}`;
    const baselineTitleEN = `Initial E2E version ${suffix}`;
    const newTitleFR = `Mentions légales E2E ${suffix}`;
    const newTitleEN = `Legal notice E2E ${suffix}`;
    const baselineDate = '2026-01-01';
    const publishDate = '2026-10-01';

    // Restore default content before the scenario so each project starts clean
    restoreDefaultSiteContent();

    try {
      // 1. Authenticate
      await page.goto('/admin');
      const e2e_password = process.env.E2E_ADMIN_PASSWORD || 'e2e_password';
      await page.fill('input[name="password"]', e2e_password);
      await page.click('button[type="submit"]');
      await expect(page.getByRole('heading', { name: 'Administration Sempra' })).toBeVisible();

      // 1b. Prepare business settings to enable publishing
      await page.goto('/admin/settings');
      await page.fill('textarea#address', '123 E2E Street');
      await page.fill('input#enterpriseNumber', 'E2E-123456');
      await page.fill('input#hostingProvider', 'E2E Hosting');
      const settingsSavePromise = page.waitForResponse(r => r.url().includes('/admin/settings') && r.request().method() === 'POST');
      await page.click('button:has-text("Enregistrer")');
      const settingsSaveRes = await settingsSavePromise;
      expect(settingsSaveRes.status()).toBe(200);
      await page.reload();
      await expect(page.locator('textarea#address')).toHaveValue('123 E2E Street');
      await expect(page.locator('input#enterpriseNumber')).toHaveValue('E2E-123456');
      await expect(page.locator('input#hostingProvider')).toHaveValue('E2E Hosting');

      // 2. Navigate to legal pages administration
      await page.goto('/admin/legal');
      await expect(page.getByRole('heading', { name: 'Pages Légales' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Mentions Légales', exact: true })).toBeVisible();

      // 3. Publish a baseline version with a unique title for this project
      await page.getByRole('button', { name: 'FR', exact: true }).click();
      await page.fill('input#pubTitle', baselineTitleFR);
      await page.getByRole('button', { name: 'EN', exact: true }).click();
      await page.fill('input#pubTitle', baselineTitleEN);
      await page.getByRole('button', { name: 'FR', exact: true }).click();
      await page.fill('input#effectiveDate', baselineDate);
      const publishRefPromise = page.waitForResponse(r => r.url().includes('/admin/legal') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Publier', exact: true }).click();
      const publishRefRes = await publishRefPromise;
      expect(publishRefRes.status()).toBe(200);
      await expect(page.getByRole('status')).toHaveText('Modifications enregistrées.');

      // 4. Modify FR draft text
      await page.getByRole('button', { name: 'FR', exact: true }).click();
      await page.fill('input#pubTitle', newTitleFR);

      // 5. Modify EN draft text
      await page.getByRole('button', { name: 'EN', exact: true }).click();
      await page.fill('input#pubTitle', newTitleEN);

      // 6. Save draft
      const saveDraftPromise = page.waitForResponse(r => r.url().includes('/admin/legal') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }).click();
      const saveDraftRes = await saveDraftPromise;
      expect(saveDraftRes.status()).toBe(200);
      await expect(page.getByRole('status')).toHaveText('Modifications enregistrées.');

      // 7. Verify persistence after reload
      await page.reload();
      await page.getByRole('button', { name: 'FR', exact: true }).click();
      await expect(page.locator('input#pubTitle')).toHaveValue(newTitleFR);
      await page.getByRole('button', { name: 'EN', exact: true }).click();
      await expect(page.locator('input#pubTitle')).toHaveValue(newTitleEN);

      // 8. Verify public pages retain baseline version (independence)
      await page.goto('/fr/mentions-legales');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(baselineTitleFR);

      await page.goto('/en/legal');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(baselineTitleEN);

      // 9. Publish the new version
      await page.goto('/admin/legal');
      await expect(page.getByRole('button', { name: 'Mentions Légales', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'FR', exact: true }).click();
      await page.fill('input#effectiveDate', publishDate);
      const publishPromise = page.waitForResponse(r => r.url().includes('/admin/legal') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Publier', exact: true }).click();
      const publishRes = await publishPromise;
      expect(publishRes.status()).toBe(200);
      await expect(page.getByRole('status')).toHaveText('Modifications enregistrées.');

      // 10. Verify new version on public pages
      await page.goto('/fr/mentions-legales');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(newTitleFR);

      await page.goto('/en/legal');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(newTitleEN);

      // 11. Verify history in admin
      await page.goto('/admin/legal');
      await expect(page.getByRole('button', { name: 'Mentions Légales', exact: true })).toBeVisible();

      // Check current version contains our project-specific title
      const currentVersion = page.getByTestId('legal-history-current');
      await expect(currentVersion).toHaveCount(1);
      await expect(currentVersion).toContainText('(Courante)');
      await expect(currentVersion).toContainText(newTitleFR);
      await expect(currentVersion).toContainText(publishDate);

      // Check archived version: filter by our project-specific baseline title
      const archivedVersion = page
        .getByTestId('legal-history-archived')
        .filter({ hasText: baselineTitleFR });
      await expect(archivedVersion).toHaveCount(1);
      await expect(archivedVersion).toContainText('(Archivée)');
      await expect(archivedVersion).toContainText(baselineTitleFR);
      await expect(archivedVersion).toContainText(baselineDate);
    } finally {
      // Restore storage to default so subsequent projects start clean
      restoreDefaultSiteContent();
    }
  });
});
