import { test, expect } from '@playwright/test';

test.describe('Contact Form', () => {
  test('should show error when submitting the form (Phase 3 pending)', async ({ page }) => {
    await page.goto('/fr/contact');
    
    // Fill required fields
    await page.fill('#tm-names', 'Test Names');
    await page.fill('#tm-email', 'test@example.com');
    await page.fill('#tm-date', '2027-08-15');
    await page.fill('#tm-lieu', 'Bruxelles');
    await page.selectOption('#tm-formule', 'photo-signature');
    await page.fill('#tm-message', 'Ceci est un message de test.');
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Verify error message instead of dev_mock
    await expect(page.locator('text=Service d\'envoi indisponible')).toBeVisible();
  });
});
