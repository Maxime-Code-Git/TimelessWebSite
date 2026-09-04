import { test, expect } from '@playwright/test';

test.describe('Rebranding and ScrollTop', () => {
  test('serves new SVGs and PNGs successfully', async ({ request }) => {
    const navy = await request.get('/brand/sempra_horizontal_navy.svg');
    expect(navy.ok()).toBeTruthy();
    expect(navy.headers()['content-type']).toContain('image/svg+xml');

    const ivory = await request.get('/brand/sempra_horizontal_ivory.svg');
    expect(ivory.ok()).toBeTruthy();
    expect(ivory.headers()['content-type']).toContain('image/svg+xml');

    const symbol = await request.get('/brand/sempra_symbol_navy.svg');
    expect(symbol.ok()).toBeTruthy();

    const png = await request.get('/brand/SempraLogoBlue.png');
    expect(png.ok()).toBeTruthy();
  });

  test('checks logos, alt, aria-label, and favicon on homepage (FR)', async ({ page }) => {
    await page.goto('/fr/');

    // Favicons
    const icon = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(icon).toBe('/brand/sempra_symbol_navy.svg');
    const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect(appleIcon).toBe('/brand/SempraLogoBlue.png');

    // Header logo
    const headerLogo = page.locator('header img[alt="Sempra"]').first();
    await expect(headerLogo).toBeVisible();
    await expect(headerLogo).toHaveAttribute('src', '/brand/sempra_horizontal_navy.svg');
    const headerLink = page.locator('header a[aria-label="Sempra — Accueil"]').first();
    await expect(headerLink).toBeVisible();

    // Footer logo
    const footerLogo = page.locator('footer img[alt="Sempra"]').first();
    await footerLogo.scrollIntoViewIfNeeded();
    await expect(footerLogo).toBeVisible();
    await expect(footerLogo).toHaveAttribute('src', '/brand/sempra_horizontal_ivory.svg');
    const footerLink = page.locator('footer a[aria-label="Sempra — Accueil"]').first();
    await expect(footerLink).toBeVisible();

    // SEO Title
    await expect(page).toHaveTitle(/Sempra/);
  });

  test('ScrollTop behavior on desktop', async ({ page }) => {
    await page.goto('/fr/cgv'); // A long page

    // Ensure only one scroll top button exists
    const scrollBtns = page.locator('button[aria-label="Retour en haut de page"]');
    await expect(scrollBtns).toHaveCount(1);

    const btn = scrollBtns.first();
    // It should have aria-hidden true and be invisible at top
    await expect(btn).toHaveAttribute('aria-hidden', 'true');
    await expect(btn).toHaveCSS('visibility', 'hidden');
    await expect(btn).toHaveCSS('pointer-events', 'none');

    // Scroll down
    await page.setViewportSize({ width: 500, height: 300 });
    await page.mouse.wheel(0, 5000);
    // Button should appear
    await expect(btn).toHaveAttribute('aria-hidden', 'false');
    await expect(btn).toHaveCSS('visibility', 'visible');
    await expect(btn).toHaveCSS('pointer-events', 'auto');
    await expect(btn).toHaveCSS('opacity', '1');

    // Check SVG stem
    const path = btn.locator('svg path');
    await expect(path).toHaveAttribute('d', 'M12 19V5M5 12l7-7 7 7');

    // Click it
    await btn.click();

    // Wait for scroll to reach top
    await page.waitForFunction(() => window.scrollY === 0);
    await expect(btn).toHaveAttribute('aria-hidden', 'true');
  });

  test('ScrollTop English label', async ({ page }) => {
    await page.goto('/en/terms');
    const btn = page.locator('button[aria-label="Back to top"]');
    await expect(btn).toHaveCount(1);
  });
  test('ScrollTop respects reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/fr/cgv');
    const scrollBtns = page.locator('button[aria-label="Retour en haut de page"]');
    await expect(scrollBtns).toHaveCount(1);

    await page.setViewportSize({ width: 500, height: 300 });
    await page.mouse.wheel(0, 5000);
    const btn = scrollBtns.first();
    await expect(btn).toHaveAttribute('aria-hidden', 'false');

    // Setup the mock before clicking
    await page.evaluate(() => {
      interface TestWindow extends Window {
        __scrollBehavior?: ScrollBehavior;
      }
      const testWindow = window as unknown as TestWindow;
      testWindow.__scrollBehavior = 'smooth';
      window.scrollTo = function(optionsOrX?: ScrollToOptions | number, _y?: number) {
        if (typeof optionsOrX === 'object' && optionsOrX !== null && optionsOrX.behavior) {
          testWindow.__scrollBehavior = optionsOrX.behavior;
        }
      };
    });

    await btn.click();

    const behavior = await page.evaluate(() => {
      interface TestWindow extends Window {
        __scrollBehavior?: ScrollBehavior;
      }
      return (window as unknown as TestWindow).__scrollBehavior;
    });
    expect(behavior).toBe('auto');
  });

  test('ScrollTop smooth motion by default', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/fr/cgv');
    const scrollBtns = page.locator('button[aria-label="Retour en haut de page"]');
    await expect(scrollBtns).toHaveCount(1);

    await page.setViewportSize({ width: 500, height: 300 });
    await page.mouse.wheel(0, 5000);
    const btn = scrollBtns.first();
    await expect(btn).toHaveAttribute('aria-hidden', 'false');

    await page.evaluate(() => {
      interface TestWindow extends Window {
        __scrollBehavior?: ScrollBehavior;
      }
      const testWindow = window as unknown as TestWindow;
      testWindow.__scrollBehavior = 'auto';
      window.scrollTo = function(optionsOrX?: ScrollToOptions | number, _y?: number) {
        if (typeof optionsOrX === 'object' && optionsOrX !== null && optionsOrX.behavior) {
          testWindow.__scrollBehavior = optionsOrX.behavior;
        }
      };
    });

    await btn.click();

    const behavior = await page.evaluate(() => {
      interface TestWindow extends Window {
        __scrollBehavior?: ScrollBehavior;
      }
      return (window as unknown as TestWindow).__scrollBehavior;
    });
    expect(behavior).toBe('smooth');
  });
});
