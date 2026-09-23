import { test, expect } from '@playwright/test';

// The user mentioned using the real auth flow. We'll login manually on /admin.
test.describe('Admin Contact End-to-End', () => {
  test('authenticates, modifies content, verifies persistance and public visibility, then restores', async ({ page }) => {
    // 1. Authenticate
    await page.goto('/admin');
    await page.fill('input[name="password"]', 'e2e_password'); // Standard mock/e2e password from infrastructure
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/admin$/);

    // 2. Go to Contact Admin
    await page.goto('/admin/contact');
    await expect(page).toHaveURL(/\/admin\/contact$/);

    // 3. Save current values for restoration
    const titleFrInput = page.locator('label', { hasText: 'Titre principal' }).locator('..').locator('input').first();
    const titleEnInput = page.locator('label', { hasText: 'Titre principal' }).locator('..').locator('input').nth(1);
    const seoTitleFrInput = page.locator('label', { hasText: 'Titre SEO' }).locator('..').locator('input').first();
    const seoTitleEnInput = page.locator('label', { hasText: 'Titre SEO' }).locator('..').locator('input').nth(1);
    const seoDescFrInput = page.locator('label', { hasText: 'Méta-description' }).locator('..').locator('textarea').first();
    const seoDescEnInput = page.locator('label', { hasText: 'Méta-description' }).locator('..').locator('textarea').nth(1);

    const originalTitleFr = await titleFrInput.inputValue();
    const originalTitleEn = await titleEnInput.inputValue();
    const originalSeoTitleFr = await seoTitleFrInput.inputValue();
    const originalSeoTitleEn = await seoTitleEnInput.inputValue();
    const originalSeoDescFr = await seoDescFrInput.inputValue();
    const originalSeoDescEn = await seoDescEnInput.inputValue();

    // 4. Modify values
    const timestamp = Date.now();
    const newTitleFr = `Titre FR ${timestamp}`;
    const newTitleEn = `Title EN ${timestamp}`;
    const newSeoTitleFr = `SEO FR ${timestamp}`;
    const newSeoTitleEn = `SEO EN ${timestamp}`;
    const newSeoDescFr = `Desc FR ${timestamp}`;
    const newSeoDescEn = `Desc EN ${timestamp}`;

    await titleFrInput.fill(newTitleFr);
    await titleEnInput.fill(newTitleEn);
    await seoTitleFrInput.fill(newSeoTitleFr);
    await seoTitleEnInput.fill(newSeoTitleEn);
    await seoDescFrInput.fill(newSeoDescFr);
    await seoDescEnInput.fill(newSeoDescEn);

    // 5. Submit and wait for POST 200
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/admin/contact') && res.request().method() === 'POST'),
      page.click('button[type="submit"]')
    ]);
    expect(response.status()).toBe(200);

    // 6. Verify success status
    await expect(page.locator('div[role="status"]')).toContainText('succès', { ignoreCase: true });

    // 7. Reload and verify persistance
    await page.goto('/admin/contact');
    await expect(titleFrInput).toHaveValue(newTitleFr);
    await expect(titleEnInput).toHaveValue(newTitleEn);

    // 8. Verify public pages (FR)
    await page.goto('/fr/contact');
    await expect(page.locator('h1')).toContainText(newTitleFr);
    await expect(page).toHaveTitle(newSeoTitleFr);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', newSeoDescFr);

    // 9. Verify public pages (EN)
    await page.goto('/en/contact');
    await expect(page.locator('h1')).toContainText(newTitleEn);
    await expect(page).toHaveTitle(newSeoTitleEn);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', newSeoDescEn);

    // 10. Restore original values
    await page.goto('/admin/contact');
    await titleFrInput.fill(originalTitleFr);
    await titleEnInput.fill(originalTitleEn);
    await seoTitleFrInput.fill(originalSeoTitleFr);
    await seoTitleEnInput.fill(originalSeoTitleEn);
    await seoDescFrInput.fill(originalSeoDescFr);
    await seoDescEnInput.fill(originalSeoDescEn);

    const [restoreResponse] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/admin/contact') && res.request().method() === 'POST'),
      page.click('button[type="submit"]')
    ]);
    expect(restoreResponse.status()).toBe(200);
  });
});
