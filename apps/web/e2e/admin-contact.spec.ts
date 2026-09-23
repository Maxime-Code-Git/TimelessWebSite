import { test, expect } from '@playwright/test';

test.describe('Admin Contact Flow', () => {
  test('authenticates, edits contact content, saves and verifies on public page', async ({ page, context }) => {
    // 1. Navigate to admin login
    await page.goto('/admin');

    // 2. Authenticate
    await page.fill('input[name="password"]', 'test');
    await page.click('button[type="submit"]');

    // Ensure we reached dashboard
    await expect(page).toHaveURL(/\/admin$/);

    // 3. Navigate to /admin/contact
    await page.goto('/admin/contact');
    await expect(page).toHaveURL(/\/admin\/contact$/);

    // 4. Modify a text field (using label)
    const newTitle = 'Titre E2E ' + Date.now();
    const titleInput = page.locator('label', { hasText: 'Titre principal' }).locator('..').locator('input');
    await titleInput.fill(newTitle);

    // 5. Save changes
    await page.click('button[type="submit"]');

    // Verify success message appears
    await expect(page.locator('div[role="status"]')).toContainText('succès');

    // 6. Verify on public page
    await page.goto('/fr/contact');

    // Check if the new title is rendered in the hero section
    await expect(page.locator('h1')).toContainText(newTitle);
  });
});
