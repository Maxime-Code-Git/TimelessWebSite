import { test, expect } from '@playwright/test';

test.describe('Admin CSP and Styles', () => {
  test('should not have any inline styles on /admin login and dashboard', async ({ page, request }) => {
    const pageErrors: string[] = [];
    const cspErrors: string[] = [];
    
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text().toLowerCase();
        if (text.includes('content security policy') || text.includes('csp')) {
          cspErrors.push(msg.text());
        }
      }
    });

    // 1. Check CSP header
    const response = await request.get('/admin');
    const csp = response.headers()['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).not.toContain("'unsafe-inline'");

    // 2. Check Login Page
    await page.goto('/admin');
    expect(await page.locator('[style]').count()).toBe(0);

    // 3. Login and check Dashboard
    await page.fill('input[name="password"]', 'e2e_password');
    await page.click('button[type="submit"]');

    // Wait for dashboard to load
    await expect(page.locator('h1')).toContainText('Administration Timeless');
    expect(await page.locator('[style]').count()).toBe(0);

    // 4. Verify Pricing Page
    const pricingRes = await page.goto('/admin/pricing');
    expect(pricingRes?.status()).toBe(200);
    const cspHeaderPricing = pricingRes?.headers()['content-security-policy'];
    expect(cspHeaderPricing).toBeDefined();
    expect(cspHeaderPricing).not.toContain("'unsafe-inline'");
    await expect(page.locator('h1')).toContainText('Formules et tarifs');
    expect(await page.locator('[style]').count()).toBe(0);
    expect(await page.locator('[class*="undefined"]').count()).toBe(0);

    // 5. Verify Settings Page
    const settingsRes = await page.goto('/admin/settings');
    expect(settingsRes?.status()).toBe(200);
    const cspHeaderSettings = settingsRes?.headers()['content-security-policy'];
    expect(cspHeaderSettings).toBeDefined();
    expect(cspHeaderSettings).not.toContain("'unsafe-inline'");
    await expect(page.locator('h1')).toContainText('Textes et informations');
    expect(await page.locator('[style]').count()).toBe(0);
    expect(await page.locator('[class*="undefined"]').count()).toBe(0);

    // Verify no CSP errors were logged during the whole navigation
    expect(cspErrors).toHaveLength(0);
    expect(pageErrors.filter(e => !e.includes('favicon'))).toHaveLength(0);

    // 6. Verify Portfolio Pages
    const checkRoute = async (route: string) => {
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      const cspHeader = res?.headers()['content-security-policy'];
      expect(cspHeader).toBeDefined();
      expect(cspHeader).not.toContain("'unsafe-inline'");
      expect(await page.locator('[style]').count()).toBe(0);
      expect(await page.locator('[class*="undefined"]').count()).toBe(0);
      expect(cspErrors).toHaveLength(0);
      expect(pageErrors.filter(e => !e.includes('favicon'))).toHaveLength(0);
    };

    await checkRoute('/admin/portfolio');
    await checkRoute('/admin/portfolio/new');

    // Create a temporary project to test the edit and preview routes
    await page.fill('input[name="titleFr"]', 'CSP FR');
    await page.fill('input[name="titleEn"]', 'CSP EN');
    await page.fill('textarea[name="descriptionFr"]', 'Desc');
    await page.fill('textarea[name="descriptionEn"]', 'Desc');
    await page.click('button[type="submit"]');
    
    // Now on /admin/portfolio
    const editLink = page.locator('a', { hasText: 'Modifier' }).first();
    const href = await editLink.getAttribute('href');
    expect(href).toBeDefined();
    const projectId = href!.split('/').pop();

    await checkRoute(`/admin/portfolio/${projectId}`);
    await checkRoute(`/admin/portfolio/${projectId}/preview`);

    // Clean up
    await page.goto('/admin/portfolio');
    page.on('dialog', dialog => dialog.accept());
    await page.locator('button:has-text("Supprimer")').first().click();
  });
});
