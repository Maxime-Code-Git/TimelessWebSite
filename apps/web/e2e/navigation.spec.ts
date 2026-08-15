import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should navigate between pages using the header', async ({ page }) => {
    await page.goto('/fr/');
    
    // Go to Portfolio
    await page.getByRole('link', { name: /Portfolio/i }).click();
    await expect(page).toHaveURL(/.*\/fr\/portfolio/);
    await expect(page.locator('h1')).toContainText('Portfolio');

    // Go to Formules
    await page.getByRole('link', { name: /Formules/i }).click();
    await expect(page).toHaveURL(/.*\/fr\/formules/);
    await expect(page.locator('h1')).toContainText('Formules & Tarifs');
  });

  test('language switcher should work', async ({ page }) => {
    await page.goto('/fr/portfolio');
    
    // Switch to English
    await page.getByRole('link', { name: /EN/ }).click();
    await expect(page).toHaveURL(/.*\/en\/portfolio/);
    
    // Switch back to French
    await page.getByRole('link', { name: /FR/ }).click();
    await expect(page).toHaveURL(/.*\/fr\/portfolio/);
  });
});
