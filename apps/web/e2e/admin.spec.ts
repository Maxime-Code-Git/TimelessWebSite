import { test, expect } from '@playwright/test';

test.describe('Admin Login Flow (Phase 3A)', () => {
  test('should display login form when not authenticated', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('h1')).toContainText('Administration');
    await expect(page.locator('label')).toContainText('Mot de passe');
    // Ensure no email field exists
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test('should reject incorrect password', async ({ page }) => {
    await page.goto('/admin');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('p[role="alert"]')).toContainText('Mot de passe incorrect.');
    // Should still be on the login page (h1 is Administration)
    await expect(page.locator('h1')).toContainText('Administration');
  });

  test('should accept correct password and show dashboard', async ({ page }) => {
    await page.goto('/admin');
    await page.fill('input[name="password"]', 'e2e_password');
    await page.click('button[type="submit"]');

    // Should show dashboard
    await expect(page.locator('h1')).toContainText('Administration Timeless');
    await expect(page.getByText('Vous êtes connecté')).toBeVisible();
    await expect(page.getByText('Galeries clients')).toBeVisible();
    await expect(page.getByText('Fonctionnalité disponible prochainement')).toHaveCount(2);

    // Refreshing should keep the session
    await page.reload();
    await expect(page.locator('h1')).toContainText('Administration Timeless');
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.goto('/admin');
    await page.fill('input[name="password"]', 'e2e_password');
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toContainText('Administration Timeless');

    // Logout
    await page.click('button:has-text("Se déconnecter")');

    // Should be back to login
    await expect(page.locator('h1', { hasText: 'Administration' })).toBeVisible();

    // Going back to /admin directly should still show login
    await page.goto('/admin');
    await expect(page.locator('h1', { hasText: 'Administration' })).toBeVisible();
  });
});
