import { test, expect } from '@playwright/test';

test.describe('SEO & Meta Tags', () => {
  test('homepage should have correct canonical and alternate links', async ({ page }) => {
    await page.goto('/fr/');
    
    // PUBLIC_SITE_URL is injected by webServer env
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBe('http://localhost:4173/fr/');
    
    const altEn = await page.locator('link[rel="alternate"][hreflang="en"]').getAttribute('href');
    expect(altEn).toBe('http://localhost:4173/en/');
    
    const altFr = await page.locator('link[rel="alternate"][hreflang="fr"]').getAttribute('href');
    expect(altFr).toBe('http://localhost:4173/fr/');
  });

  test('legal pages should have noindex', async ({ page }) => {
    await page.goto('/fr/mentions-legales');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });

  test('sitemap should be accessible', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('application/xml');
    
    const xml = await response.text();
    expect(xml).toContain('<loc>http://localhost:4173/fr/</loc>');
  });

  test('robots.txt should be accessible', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('text/plain');
    
    const text = await response.text();
    expect(text).toContain('Disallow: /fr/espace-clients');
    expect(text).toContain('Sitemap: http://localhost:4173/sitemap.xml');
  });
});
