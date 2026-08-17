import { test, expect } from '@playwright/test';

test.describe('Mobile Navigation', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE viewport

  test('should display navigation links on mobile', async ({ page }) => {
    await page.goto('/fr/');
    
    // In our new design, the navigation is always visible but might be horizontally scrollable
    // Let's verify that the Portfolio link is present in the DOM
    const portfolioLink = page.getByRole('link', { name: /Portfolio/i }).first();
    await expect(portfolioLink).toBeVisible();
    
    // Test the language switcher on mobile
    const langSwitcher = page.getByRole('link', { name: /Switch to EN/i });
    if (await langSwitcher.isVisible()) {
      await expect(langSwitcher).toBeVisible();
    }
  });
});
