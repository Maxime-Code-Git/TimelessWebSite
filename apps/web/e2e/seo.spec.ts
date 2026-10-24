import { test, expect } from '@playwright/test';

const ORDINARY_ROUTES = [
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
];

const UNPUBLISHED_LEGAL_ROUTES = [
  { path: '/fr/mentions-legales', lang: 'fr', expectedTitle: 'Page introuvable' },
  { path: '/en/legal', lang: 'en', expectedTitle: 'Page not found' },
  { path: '/fr/confidentialite', lang: 'fr', expectedTitle: 'Page introuvable' },
  { path: '/en/privacy', lang: 'en', expectedTitle: 'Page not found' },
  { path: '/fr/cgv', lang: 'fr', expectedTitle: 'Page introuvable' },
  { path: '/en/terms', lang: 'en', expectedTitle: 'Page not found' },
  { path: '/fr/cookies', lang: 'fr', expectedTitle: 'Page introuvable' },
  { path: '/en/cookies', lang: 'en', expectedTitle: 'Page not found' },
];

test.describe('SEO & Meta Tags for ordinary public routes', () => {
  for (const route of ORDINARY_ROUTES) {
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

test.describe('Unpublished Legal Routes 404 Contract', () => {
  for (const route of UNPUBLISHED_LEGAL_ROUTES) {
    test(`route ${route.path} returns secure 404 with noindex when published is null`, async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response).not.toBeNull();

      // 1. statut HTTP 404
      expect(response!.status()).toBe(404);

      // 2. header X-Robots-Tag contenant noindex, nofollow
      const headers = response!.headers();
      const xRobotsTag = headers['x-robots-tag'] || '';
      expect(xRobotsTag.toLowerCase()).toContain('noindex');
      expect(xRobotsTag.toLowerCase()).toContain('nofollow');

      // 3. header Cache-Control contenant no-store
      const cacheControl = headers['cache-control'] || '';
      expect(cacheControl.toLowerCase()).toContain('no-store');

      // 4. meta robots égale à noindex, nofollow
      const robotsMeta = await page.locator('meta[name="robots"]').getAttribute('content');
      expect(robotsMeta).toBe('noindex, nofollow');

      // 5. titre générique “Page introuvable” ou “Page not found” selon la langue
      const title = await page.title();
      expect(title).toContain(route.expectedTitle);

      // 6. absence de contenu provenant du brouillon
      const bodyText = await page.locator('body').innerText();
      const pageHtml = await page.content();
      expect(bodyText).not.toContain('Code de droit économique');
      expect(bodyText).not.toContain('RGPD');
      expect(bodyText).not.toContain('Droit de rétractation');
      expect(bodyText).not.toContain('Brouillon');
      expect(pageHtml).not.toContain('Code de droit économique');

      // 7. absence d’attente de canonical ou hreflang propre au document non publié
      const canonicalMatch = await page.locator(`link[rel="canonical"][href*="${route.path}"]`).count();
      expect(canonicalMatch).toBe(0);
      const hreflangMatch = await page.locator(`link[rel="alternate"][href*="${route.path}"]`).count();
      expect(hreflangMatch).toBe(0);
      const totalCanonical = await page.locator('link[rel="canonical"]').count();
      expect(totalCanonical).toBe(0);
    });
  }
});
