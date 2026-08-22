import { test, expect } from '@playwright/test';

const ROUTES = [
  { path: '/fr/', alt: '/en/', noindex: false },
  { path: '/en/', alt: '/fr/', noindex: false },
  { path: '/fr/portfolio', alt: '/en/portfolio', noindex: false },
  { path: '/en/portfolio', alt: '/fr/portfolio', noindex: false },
  { path: '/fr/formules', alt: '/en/pricing', noindex: false },
  { path: '/en/pricing', alt: '/fr/formules', noindex: false },
  { path: '/fr/a-propos', alt: '/en/about', noindex: false },
  { path: '/en/about', alt: '/fr/a-propos', noindex: false },
  { path: '/fr/contact', alt: '/en/contact', noindex: false },
  { path: '/en/contact', alt: '/fr/contact', noindex: false },
  { path: '/fr/espace-clients', alt: '/en/client-area', noindex: true },
  { path: '/en/client-area', alt: '/fr/espace-clients', noindex: true },
  { path: '/fr/mentions-legales', alt: '/en/legal', noindex: true },
  { path: '/en/legal', alt: '/fr/mentions-legales', noindex: true },
  { path: '/fr/confidentialite', alt: '/en/privacy', noindex: true },
  { path: '/en/privacy', alt: '/fr/confidentialite', noindex: true },
  { path: '/fr/cgv', alt: '/en/terms', noindex: true },
  { path: '/en/terms', alt: '/fr/cgv', noindex: true },
];

test.describe('SEO & Meta Tags for all routes', () => {
  for (const route of ROUTES) {
    test(`route ${route.path} should have correct canonical, alternate and robots`, async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response?.status()).not.toBe(404);
      
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical).toBe(`http://localhost:4174${route.path}`);
      
      const lang = route.path.startsWith('/fr') ? 'fr' : 'en';
      const altLang = lang === 'fr' ? 'en' : 'fr';

      const altSelf = await page.locator(`link[rel="alternate"][hreflang="${lang}"]`).getAttribute('href');
      expect(altSelf).toBe(`http://localhost:4174${route.path}`);

      const altOther = await page.locator(`link[rel="alternate"][hreflang="${altLang}"]`).getAttribute('href');
      expect(altOther).toBe(`http://localhost:4174${route.alt}`);

      // Check robots
      if (route.noindex) {
        const robots = await page.locator('meta[name="robots"]').getAttribute('content');
        expect(robots).toContain('noindex');
      } else {
        const robotsCount = await page.locator('meta[name="robots"]').count();
        if (robotsCount > 0) {
          const robots = await page.locator('meta[name="robots"]').getAttribute('content');
          expect(robots).not.toContain('noindex');
        }
      }

      // Check OG tags
      const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
      expect(ogUrl).toBe(`http://localhost:4174${route.path}`);
    });
  }

  test('sitemap should not include galleries or noindex pages', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.ok()).toBeTruthy();
    
    const xml = await response.text();
    expect(xml).toContain('<loc>http://localhost:4174/fr/</loc>');
    expect(xml).toContain('<loc>http://localhost:4174/fr/portfolio</loc>');
    
    // Check missing things
    expect(xml).not.toContain('espace-clients');
    expect(xml).not.toContain('mentions-legales');
    expect(xml).not.toContain('galerie');
    expect(xml).not.toContain('gallery');
  });
});
