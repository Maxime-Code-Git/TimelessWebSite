import { test, expect } from '@playwright/test';

test.describe('Admin CSP and Styles', () => {
  test('should not have any inline styles on /admin login and dashboard', async ({ page, request }) => {
    interface DiagnosticError {
      url: string;
      message: string;
    }

    const pageErrors: DiagnosticError[] = [];
    const cspErrors: DiagnosticError[] = [];

    page.on('pageerror', (err) => {
      pageErrors.push({ url: page.url(), message: err.message });
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text().toLowerCase();
        if (text.includes('content security policy') || text.includes('csp')) {
          cspErrors.push({ url: page.url(), message: msg.text() });
        }
      }
    });

    const assertNoErrors = (expectedRoute: string) => {
      const filteredPageErrors = pageErrors.filter(e => !e.message.includes('favicon'));

      if (cspErrors.length > 0 || filteredPageErrors.length > 0) {
        const cspDetails = cspErrors.map(e => `[CSP Error on ${e.url}]: ${e.message}`).join('\n');
        const pageDetails = filteredPageErrors.map(e => `[Page Error on ${e.url}]: ${e.message}`).join('\n');
        const combinedReport = [cspDetails, pageDetails].filter(Boolean).join('\n');
        expect(
          combinedReport,
          `Errors encountered while visiting ${expectedRoute} (current URL: ${page.url()}):\n${combinedReport}`
        ).toBe('');
      }

      cspErrors.length = 0;
      pageErrors.length = 0;
    };

    // 1. Check CSP header
    const response = await request.get('/admin');
    const csp = response.headers()['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).not.toContain("'unsafe-inline'");

    // 2. Check Login Page
    await page.goto('/admin');
    expect(await page.locator('[style]').count()).toBe(0);
    assertNoErrors('/admin (login)');

    // 3. Login and check Dashboard
    await page.fill('input[name="password"]', 'e2e_password');
    await page.click('button[type="submit"]');

    // Wait for dashboard to load
    await expect(page.locator('h1')).toContainText('Administration Sempra');
    expect(await page.locator('[style]').count()).toBe(0);
    assertNoErrors('/admin (dashboard)');

    // 4. Verify Pricing Page
    const pricingRes = await page.goto('/admin/pricing');
    expect(pricingRes?.status()).toBe(200);
    const cspHeaderPricing = pricingRes?.headers()['content-security-policy'];
    expect(cspHeaderPricing).toBeDefined();
    expect(cspHeaderPricing).not.toContain("'unsafe-inline'");
    await expect(page.locator('h1')).toContainText('Formules et tarifs');
    expect(await page.locator('[style]').count()).toBe(0);
    expect(await page.locator('[class*="undefined"]').count()).toBe(0);
    assertNoErrors('/admin/pricing');

    // 5. Verify Settings Page
    const settingsRes = await page.goto('/admin/settings');
    expect(settingsRes?.status()).toBe(200);
    const cspHeaderSettings = settingsRes?.headers()['content-security-policy'];
    expect(cspHeaderSettings).toBeDefined();
    expect(cspHeaderSettings).not.toContain("'unsafe-inline'");
    await expect(page.locator('h1')).toContainText('Textes et informations');
    expect(await page.locator('[style]').count()).toBe(0);
    expect(await page.locator('[class*="undefined"]').count()).toBe(0);
    assertNoErrors('/admin/settings');

    // 6. Verify Data Retention Page
    const retentionRes = await page.goto('/admin/data-retention');
    expect(retentionRes?.status()).toBe(200);
    const cspHeaderRetention = retentionRes?.headers()['content-security-policy'];
    expect(cspHeaderRetention).toBeDefined();
    expect(cspHeaderRetention).not.toContain("'unsafe-inline'");
    expect(await page.locator('[style]').count()).toBe(0);
    expect(await page.locator('[class*="undefined"]').count()).toBe(0);
    assertNoErrors('/admin/data-retention');

    // 7. Verify Portfolio Pages
    const checkRoute = async (route: string) => {
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      const cspHeader = res?.headers()['content-security-policy'];
      expect(cspHeader).toBeDefined();
      expect(cspHeader).not.toContain("'unsafe-inline'");
      expect(await page.locator('[style]').count()).toBe(0);
      expect(await page.locator('[class*="undefined"]').count()).toBe(0);
      assertNoErrors(route);
    };

    await checkRoute('/admin/portfolio');
    await checkRoute('/admin/portfolio/watermark');
    await checkRoute('/admin/bookings');
    await checkRoute('/admin/contact');
    await checkRoute('/admin/legal');
  });
});
