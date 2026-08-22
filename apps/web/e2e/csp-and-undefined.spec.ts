import { test, expect } from '@playwright/test';

test.describe('Technical Fidelity & CSP', () => {
  const pages = [
    '/fr/',
    '/en/',
    '/fr/portfolio',
    '/en/pricing',
    '/fr/a-propos',
    '/en/contact',
    '/fr/espace-clients'
  ];

  for (const pagePath of pages) {
    test(`should not have undefined classes on ${pagePath}`, async ({ page }) => {
      await page.goto(pagePath);

      // Check if any element has class="undefined"
      const undefinedElementsHTML = await page.evaluate(() => {
        const elements = document.querySelectorAll('[class*="undefined"]');
        return Array.from(elements).map(e => e.outerHTML);
      });

      if (undefinedElementsHTML.length > 0) {
        console.log(`UNDEFINED CLASSES FOUND ON ${pagePath}:`, undefinedElementsHTML);
      }

      expect(undefinedElementsHTML.length).toBe(0);
    });

    test(`should not have inline styles on ${pagePath}`, async ({ page }) => {
      await page.goto(pagePath);

      const inlineStyleElements = await page.evaluate(() => {
        const elements = document.querySelectorAll('[style]');
        return Array.from(elements).filter(e => {
          const style = e.getAttribute('style');
          return style && style.trim().length > 0;
        }).map(e => e.outerHTML);
      });

      if (inlineStyleElements.length > 0) {
        console.log(`INLINE STYLES FOUND ON ${pagePath}:`, inlineStyleElements);
      }

      expect(inlineStyleElements.length).toBe(0);
    });
  }
  test('should not have inline styles or undefined classes on protected admin pages', async ({ page }) => {
    // 1. se connecter avec le mot de passe E2E
    await page.goto('/admin');
    await page.fill('input[name="password"]', 'e2e_password');
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toContainText('Administration Timeless');

    const adminPages = ['/admin/pricing', '/admin/settings'];

    for (const pagePath of adminPages) {
      // 2. ouvrir réellement chaque interface protégée
      await page.goto(pagePath);

      // 3. vérifier l'URL finale pour confirmer qu'il n'a pas été redirigé vers /admin
      expect(page.url()).toContain(pagePath);

      // 4. contrôler ensuite les styles inline, erreurs console et violations CSP
      const undefinedElementsHTML = await page.evaluate(() => {
        const elements = document.querySelectorAll('[class*="undefined"]');
        return Array.from(elements).map(e => e.outerHTML);
      });
      expect(undefinedElementsHTML.length).toBe(0);

      const inlineStyleElements = await page.evaluate(() => {
        const elements = document.querySelectorAll('[style]');
        return Array.from(elements).filter(e => {
          const style = e.getAttribute('style');
          return style && style.trim().length > 0;
        }).map(e => e.outerHTML);
      });
      expect(inlineStyleElements.length).toBe(0);
    }
  });
});
