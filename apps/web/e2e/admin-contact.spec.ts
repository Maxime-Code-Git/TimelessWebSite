import { test, expect } from '@playwright/test';

test.describe('Admin Contact Content', () => {
  test.use({
    extraHTTPHeaders: {
      'Cookie': `__admin_session=test-session-cookie-mock;`
    }
  });

test('should display contact page content and save correctly', async ({ page }) => {
    // 1. Visit the admin contact page
    await page.goto('/admin/contact');
    
    // Check if the page is loaded
    await expect(page.locator('h1')).toHaveText('Page Contact');
    
    // 2. We can switch tabs
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('input[name="hero.title.en"]')).toBeVisible();

    await page.getByRole('button', { name: 'Français' }).click();
    await expect(page.locator('input[name="hero.title.fr"]')).toBeVisible();

    // 3. Fill in a field
    const titleInput = page.locator('input[name="hero.title.fr"]');
    
    await titleInput.fill('Nouveau titre hero');
    
    // 4. Submit form
    await page.getByRole('button', { name: /Enregistrer/ }).click();
    
    // Check for success message
    await expect(page.locator('.success')).toBeVisible();
    await expect(page.locator('.success')).toHaveText(/Informations mises à jour/);
  });
});
