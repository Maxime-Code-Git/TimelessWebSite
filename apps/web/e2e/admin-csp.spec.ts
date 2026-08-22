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

    // Verify no CSP errors were logged
    const cspErrors = errors.filter(e => e.toLowerCase().includes('content security policy') || e.toLowerCase().includes('csp'));
    expect(cspErrors).toHaveLength(0);
  });
});
