import { test, expect } from '@playwright/test';

test.describe('404 Page', () => {
  test('should display 404 page for unknown routes', async ({ page }) => {
    await page.goto('/fr/this-page-does-not-exist');
    
    // Playwright response status for React Router 7 client-side might not be 404 if it's SPA hydration,
    // but the initial document should be 404. Let's just check the content.
    await expect(page.locator('h1')).toContainText('404');
    
    // Check that we have a button to go back to home
    const backBtn = page.getByRole('link', { name: /Retour à l'accueil/i });
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    
    await expect(page).toHaveURL(/.*\/fr\//);
  });
});
