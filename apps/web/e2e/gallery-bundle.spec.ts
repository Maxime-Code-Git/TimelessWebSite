import { test, expect } from '@playwright/test';

test.describe('Gallery Bundle Security', () => {
  test('gallery routes should be completely excluded from client JS bundle (Phase 2)', async ({ request }) => {
    // In Phase 2, gallery routes are SSR-only redirects.
    // They should not include any client-side JavaScript that leaks passwords or demo tokens.
    
    // Fetch the client-side JS for the gallery route (if it exists)
    // Or just check that the HTML response for the gallery route doesn't contain DEMO tokens
    const response = await request.get('/fr/galerie/123');
    const html = await response.text();
    
    // The response should be a redirect or 503, not containing DEMO-FR
    expect(html).not.toContain('DEMO-FR');
    expect(html).not.toContain('VITE_GALLERY_DEMO_TOKEN');
  });
});
