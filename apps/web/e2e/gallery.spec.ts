import { test, expect } from '@playwright/test';

test.describe('Gallery Security (Phase 2)', () => {
  test('direct access to FR gallery should redirect to client area (503)', async ({ page }) => {
    await page.goto('/fr/galerie/123');
    
    // We configured it to redirect to /fr/espace-clients
    await expect(page).toHaveURL(/.*\/fr\/espace-clients/);
    
    // The client area should show the 503 unavailable message
    await expect(page.locator('h1')).toContainText('Votre galerie privée');
  });

  test('direct access to EN gallery should redirect to client area (503)', async ({ page }) => {
    await page.goto('/en/gallery/123');
    
    await expect(page).toHaveURL(/.*\/en\/client-area/);
  });

  test('client area form submission should result in error (Phase 3 pending)', async ({ page }) => {
    await page.goto('/fr/espace-clients');
    
    await page.fill('input[type="text"]', 'any-password');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=service d\'authentification')).toBeVisible();
  });
});
