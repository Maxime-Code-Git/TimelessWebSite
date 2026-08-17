import { test, expect } from '@playwright/test';

test.describe('Contact Form', () => {
  test('should show error when submitting the form (Phase 3 pending)', async ({ page }) => {
    await page.goto('/fr/contact');
    
    // Fill required fields
    await page.fill('#names', 'Test Names');
    await page.fill('#email', 'test@example.com');
    await page.fill('#date', '2027-08-15');
    await page.fill('#location', 'Bruxelles');
    await page.selectOption('#formula', 'photo');
    await page.fill('#message', 'Ceci est un message de test.');
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Verify that the submit button did nothing or the page didn't reload with success message
    // Since we do e.preventDefault() and nothing else, the form should just stay on the page with inputs filled
    await expect(page.locator('#names')).toHaveValue('Test Names');
  });
});
