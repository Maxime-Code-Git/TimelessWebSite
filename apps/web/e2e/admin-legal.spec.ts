import { test, expect } from '@playwright/test';

test.describe('Admin Legal Pages', () => {
  let initialContentFR = "";
  let initialContentEN = "";

  test('can modify draft, check public page independence, publish, and check history', async ({ page }) => {
    // Save initial content to restore it later
    await page.goto('/fr/legal');
    const titleLocatorFR = page.getByRole('heading', { level: 1 });
    initialContentFR = await titleLocatorFR.textContent() || "";

    await page.goto('/en/legal');
    const titleLocatorEN = page.getByRole('heading', { level: 1 });
    initialContentEN = await titleLocatorEN.textContent() || "";

    try {
      // 1. Authenticate
      await page.goto('/admin');
      const e2ePassword = process.env.E2E_ADMIN_PASSWORD || 'test-password';
      await page.fill('input[name="password"]', e2ePassword);
      await page.click('button[type="submit"]');
      // Wait for an authenticated dashboard element instead of just URL
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

      // 2. Navigate to legal pages administration
      await page.goto('/admin/legal');
      await expect(page.getByRole('heading', { name: 'Pages Légales' })).toBeVisible();
      await page.click('button:has-text("Mentions Légales")');

      // 3. Modify FR text
      await page.click('button:has-text("FR")');
      await page.fill('input#pubTitle', 'Mentions Légales (Brouillon)');

      // 4. Modify EN text
      await page.click('button:has-text("EN")');
      await page.fill('input#pubTitle', 'Legal Notice (Draft)');

      // 5. Save draft
      await page.click('button:has-text("Enregistrer le brouillon")');
      await expect(page.locator('.successAlert, [class*="successAlert"]')).toBeVisible();

      // 6. Verify persistence after reload
      await page.reload();
      await page.click('button:has-text("FR")');
      await expect(page.locator('input#pubTitle')).toHaveValue('Mentions Légales (Brouillon)');
      await page.click('button:has-text("EN")');
      await expect(page.locator('input#pubTitle')).toHaveValue('Legal Notice (Draft)');

      // 7. Verify public pages retain old version (independence)
      await page.goto('/fr/legal');
      await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Mentions Légales (Brouillon)');

      await page.goto('/en/legal');
      await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Legal Notice (Draft)');

      // 8. Publish
      await page.goto('/admin/legal');

      // Set required fields for publishing
      await page.click('button:has-text("FR")');
      await page.fill('input#effectiveDate', '2026-10-01');
      await page.click('button:has-text("Publier")');
      await expect(page.locator('.successAlert, [class*="successAlert"]')).toBeVisible();

      // 9. Verify new version on public pages
      await page.goto('/fr/legal');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mentions Légales (Brouillon)');

      await page.goto('/en/legal');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Legal Notice (Draft)');

      // 10. Verify history in admin
      await page.goto('/admin/legal');
      await expect(page.locator('text="(Courante)"')).toBeVisible();

    } finally {
      // 11. Restore initial state
      await page.goto('/admin/legal');

      // Reset FR
      await page.click('button:has-text("FR")');
      await page.fill('input#pubTitle', initialContentFR);
      await page.fill('input#effectiveDate', '2020-01-01');

      // Reset EN
      await page.click('button:has-text("EN")');
      await page.fill('input#pubTitle', initialContentEN);

      await page.click('button:has-text("Publier")');
      await expect(page.locator('.successAlert, [class*="successAlert"]')).toBeVisible();
    }
  });
});
