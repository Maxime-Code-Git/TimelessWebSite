import { test, expect } from '@playwright/test';

test.describe('404 Page', () => {
  test('should display 404 page and return 404 status for unknown routes', async ({ page }) => {
    const response = await page.goto('/fr/this-page-does-not-exist');
    expect(response?.status()).toBe(404);

    // The title in French is "Cette page n'existe pas."
    await expect(page.locator('h1')).toContainText("Cette page n'existe pas.");
    
    // Check that we have a button to go back to home
    const backBtn = page.getByRole('link', { name: /Retour à l'accueil/i });
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    
    await expect(page).toHaveURL(/.*\/fr\//);
  });
});
