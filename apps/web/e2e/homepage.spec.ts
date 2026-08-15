import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('should load the homepage in French by default', async ({ page }) => {
    await page.goto('/fr/');
    
    // Check main title
    await expect(page.locator('h1')).toContainText('Arrêter le temps');
    
    // Check navigation to contact
    const contactBtn = page.locator('a', { hasText: 'Nous contacter' }).first();
    await expect(contactBtn).toBeVisible();
  });

  test('should load the homepage in English', async ({ page }) => {
    await page.goto('/en/');
    
    await expect(page.locator('h1')).toContainText('Stop time');
    
    const contactBtn = page.locator('a', { hasText: 'Contact us' }).first();
    await expect(contactBtn).toBeVisible();
  });

  test('should have working package tabs', async ({ page }) => {
    await page.goto('/fr/');
    
    // Check that "Photo & Film" is active by default
    const duoTab = page.getByRole('tab', { name: /Photo & Film/i });
    await expect(duoTab).toHaveAttribute('aria-selected', 'true');
    
    // Click "Photo" tab
    await page.getByRole('tab', { name: 'Photographie' }).click();
    await expect(page.getByRole('tab', { name: 'Photographie' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('text=Couverture photo')).toBeVisible();
  });
});
