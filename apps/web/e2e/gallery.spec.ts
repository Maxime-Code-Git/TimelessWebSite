import { test, expect } from '@playwright/test';

test.describe('Gallery Security', () => {
  test('direct access to FR gallery should redirect to client area (401/302)', async ({ page }) => {
    await page.goto('/fr/galerie/123');
    await expect(page).toHaveURL(/.*\/fr\/espace-clients/);
  });

  test('direct access to EN gallery should redirect to client area (401/302)', async ({ page }) => {
    await page.goto('/en/gallery/123');
    await expect(page).toHaveURL(/.*\/en\/client-area/);
  });
});
