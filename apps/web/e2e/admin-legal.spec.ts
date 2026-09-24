import { test, expect } from '@playwright/test';

test.describe('Admin Legal Pages', () => {
  test('can modify draft, check public page independence, publish, and check history', async ({ page }) => {
    // 1. Authenticate
    await page.goto('/admin');
    const e2e_password = process.env.E2E_ADMIN_PASSWORD || 'e2e_password';
    await page.fill('input[name="password"]', e2e_password);
    await page.click('button[type="submit"]');
    // Wait for an authenticated dashboard element instead of just URL
    await expect(page.getByRole('heading', { name: 'Administration Sempra' })).toBeVisible();

    // 1b. Prepare business settings to enable publishing
    await page.goto('/admin/settings');
    await page.fill('input#address', '123 E2E Street');
    await page.fill('input#enterpriseNumber', 'E2E-123456');
    await page.fill('input#hostingProvider', 'E2E Hosting');
    const settingsSavePromise = page.waitForResponse(r => r.url().includes('/admin/settings') && r.request().method() === 'POST');
    await page.click('button:has-text("Enregistrer")');
    const settingsSaveRes = await settingsSavePromise;
    expect(settingsSaveRes.status()).toBe(200);
    await page.reload();
    await expect(page.locator('input#address')).toHaveValue('123 E2E Street');
    await expect(page.locator('input#enterpriseNumber')).toHaveValue('E2E-123456');
    await expect(page.locator('input#hostingProvider')).toHaveValue('E2E Hosting');

    // 2. Navigate to legal pages administration
    await page.goto('/admin/legal');
    await expect(page.getByRole('heading', { name: 'Pages Légales' })).toBeVisible();
    await page.click('button:has-text("Mentions Légales")');

    // 3. Prepare a published version of reference
    await page.click('button:has-text("FR")');
    await page.fill('input#effectiveDate', '2026-01-01');
    const publishRefPromise = page.waitForResponse(r => r.url().includes('/admin/legal') && r.request().method() === 'POST');
    await page.click('button:has-text("Publier")');
    const publishRefRes = await publishRefPromise;
    expect(publishRefRes.status()).toBe(200);
    await expect(page.locator('.successAlert, [class*="successAlert"]')).toBeVisible();

    // Store the published title for comparison
    const initialTitleFR = await page.locator('input#pubTitle').inputValue();
    await page.click('button:has-text("EN")');
    const initialTitleEN = await page.locator('input#pubTitle').inputValue();

    // 4. Modify FR draft text
    await page.click('button:has-text("FR")');
    await page.fill('input#pubTitle', 'Mentions Légales (Brouillon)');

    // 5. Modify EN draft text
    await page.click('button:has-text("EN")');
    await page.fill('input#pubTitle', 'Legal Notice (Draft)');

    // 6. Save draft
    const saveDraftPromise = page.waitForResponse(r => r.url().includes('/admin/legal') && r.request().method() === 'POST');
    await page.click('button:has-text("Enregistrer le brouillon")');
    const saveDraftRes = await saveDraftPromise;
    expect(saveDraftRes.status()).toBe(200);
    await expect(page.locator('.successAlert, [class*="successAlert"]')).toBeVisible();

    // 7. Verify persistence after reload
    await page.reload();
    await page.click('button:has-text("FR")');
    await expect(page.locator('input#pubTitle')).toHaveValue('Mentions Légales (Brouillon)');
    await page.click('button:has-text("EN")');
    await expect(page.locator('input#pubTitle')).toHaveValue('Legal Notice (Draft)');

    // 8. Verify public pages retain old version (independence)
    await page.goto('/fr/mentions-legales');
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Mentions Légales (Brouillon)');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(initialTitleFR);

    await page.goto('/en/legal');
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Legal Notice (Draft)');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(initialTitleEN);

    // 9. Publish
    await page.goto('/admin/legal');
    await page.click('button:has-text("Mentions Légales")');
    await page.click('button:has-text("FR")');
    await page.fill('input#effectiveDate', '2026-10-01');
    const publishPromise = page.waitForResponse(r => r.url().includes('/admin/legal') && r.request().method() === 'POST');
    await page.click('button:has-text("Publier")');
    const publishRes = await publishPromise;
    expect(publishRes.status()).toBe(200);
    await expect(page.locator('.successAlert, [class*="successAlert"]')).toBeVisible();

    // 10. Verify new version on public pages
    await page.goto('/fr/mentions-legales');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mentions Légales (Brouillon)');

    await page.goto('/en/legal');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Legal Notice (Draft)');

    // 11. Verify history in admin
    await page.goto('/admin/legal');
    await page.click('button:has-text("Mentions Légales")');
    
    // Check current version
    await expect(page.locator('text="(Courante)"')).toBeVisible();
    await expect(page.locator('text="2026-10-01"').first()).toBeVisible();
    
    // Check archived version
    await expect(page.locator('text="(Archivée)"')).toBeVisible();
    await expect(page.locator('text="2026-01-01"').first()).toBeVisible();
  });
});
