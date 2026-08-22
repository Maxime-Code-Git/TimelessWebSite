import { test, expect } from '@playwright/test';

test.describe('Admin CSP and Styles', () => {
  test('should not have any inline styles on /admin login and dashboard', async ({ page, request }) => {
    // 1. Check CSP header
    const response = await request.get('/admin');
    const csp = response.headers()['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).not.toContain("'unsafe-inline'");

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // 2. Check Login Page
    await page.goto('/admin');
    const inlineStylesLogin = await page.locator('[style]').count();
    expect(inlineStylesLogin).toBe(0);

    // 3. Login and check Dashboard
    await page.fill('input[name="password"]', 'e2e_password');
    await page.click('button[type="submit"]');

    // Wait for dashboard to load
    await expect(page.locator('h1')).toContainText('Administration Timeless');

    const inlineStylesDashboard = await page.locator('[style]').count();
    expect(inlineStylesDashboard).toBe(0);

    // 4. Verify Pricing Page
    const pricingRes = await page.goto('/admin/pricing');
    expect(pricingRes?.status()).toBe(200);
    expect(pricingRes?.headers()['content-security-policy']).not.toContain("'unsafe-inline'");
    await expect(page.locator('h1')).toContainText('Formules et tarifs');
    const inlineStylesPricing = await page.locator('[style]').count();
    expect(inlineStylesPricing).toBe(0);
    const undefinedClassesPricing = await page.locator('[class*="undefined"]').count();
    expect(undefinedClassesPricing).toBe(0);

    // 5. Verify Settings Page
    const settingsRes = await page.goto('/admin/settings');
    expect(settingsRes?.status()).toBe(200);
    expect(settingsRes?.headers()['content-security-policy']).not.toContain("'unsafe-inline'");
    await expect(page.locator('h1')).toContainText('Textes et informations');
    const inlineStylesSettings = await page.locator('[style]').count();
    expect(inlineStylesSettings).toBe(0);
    const undefinedClassesSettings = await page.locator('[class*="undefined"]').count();
    expect(undefinedClassesSettings).toBe(0);

    // Verify no CSP errors were logged during the whole navigation
    const cspErrors = errors.filter(e => e.toLowerCase().includes('content security policy') || e.toLowerCase().includes('csp'));
    expect(cspErrors).toHaveLength(0);
    // Also verify no other page errors occurred
    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });
});
