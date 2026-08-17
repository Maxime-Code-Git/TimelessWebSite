import { test, expect } from '@playwright/test';

test.describe('404 Page', () => {
  test('should display 404 page for unknown routes', async ({ page }) => {
    await page.goto('/fr/this-page-does-not-exist');
    
    // The title in French is "Cette page n'existe pas." or similar
    await expect(page.locator('h1')).toContainText('n\'existe pas');
    
    // Check that we have a button to go back to home
    const backBtn = page.getByRole('link', { name: /Retour à l'accueil/i });
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    
    await expect(page).toHaveURL(/.*\/fr\//);
  });
});
