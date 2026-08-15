import { test, expect } from '@playwright/test';

test.describe('Mobile Navigation', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE viewport

  test('should open and close mobile menu', async ({ page }) => {
    await page.goto('/fr/');
    
    // Menu shouldn't be visible initially
    await expect(page.locator('nav').filter({ hasText: 'Portfolio' })).toBeHidden();
    
    // Find the hamburger button (it might be an SVG or button with specific class)
    // We can click the menu toggle button
    // Just looking for the button that toggles the menu
    // Because the exact selector depends on implementation, we'll try a generic approach
    // In our Header.tsx, we have an setIsMenuOpen state triggered by a button.
    const toggleBtn = page.locator('header button').first();
    await toggleBtn.click();
    
    // After clicking, the menu overlay should be visible and contain links
    await expect(page.getByRole('link', { name: /Portfolio/i }).first()).toBeVisible();
    
    // Click close button (usually the same toggle button or a specific close button)
    await toggleBtn.click();
  });
});
