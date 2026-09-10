import { test, expect } from '@playwright/test';

test.describe('Visio Booking Flow', () => {
  test('should display booking slots, submit a request, and show success message', async ({ page }) => {
    // Navigate to contact page
    await page.goto('/en/contact');
    
    // Find the visio booking section
    const visioSection = page.locator('text=Book a video meeting');
    await expect(visioSection).toBeVisible();

    // Select a date
    const dateSelect = page.locator('select[name="date"]');
    await dateSelect.waitFor({ state: 'visible' });
    
    // Check available options
    const options = await dateSelect.locator('option').allInnerTexts();
    if (options.length > 1) {
      await dateSelect.selectOption({ index: 1 });
      
      const timeSelect = page.locator('select[name="time"]');
      await timeSelect.waitFor({ state: 'visible' });
      const timeOptions = await timeSelect.locator('option').allInnerTexts();
      
      if (timeOptions.length > 1) {
        await timeSelect.selectOption({ index: 1 });
        
        // Fill form
        await page.locator('input[name="names"]').fill('John Doe E2E');
        await page.locator('input[name="email"]').fill('john.doe@example.com');
        
        // Submit
        await page.locator('button[type="submit"]').locator('text=Request appointment').click();
        
        // Verify success
        const successMessage = page.locator('text=Your request has been saved');
        await expect(successMessage).toBeVisible();
      }
    }
  });

  test('should respect concurrent booking isolation', async ({ browser }) => {
    // "isolation complète de la base entre les navigateurs" -> test with two distinct browser contexts
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await page1.goto('/en/contact');
    await page2.goto('/en/contact');

    // Make sure both see the form
    await expect(page1.locator('select[name="date"]')).toBeVisible();
    await expect(page2.locator('select[name="date"]')).toBeVisible();

    const dateOptions1 = await page1.locator('select[name="date"] option').allInnerTexts();
    if (dateOptions1.length > 1) {
      await page1.locator('select[name="date"]').selectOption({ index: 1 });
      await page2.locator('select[name="date"]').selectOption({ index: 1 });

      const timeOptions1 = await page1.locator('select[name="time"] option').allInnerTexts();
      if (timeOptions1.length > 1) {
        await page1.locator('select[name="time"]').selectOption({ index: 1 });
        await page2.locator('select[name="time"]').selectOption({ index: 1 });

        await page1.locator('input[name="names"]').fill('Alice E2E');
        await page1.locator('input[name="email"]').fill('alice@example.com');

        await page2.locator('input[name="names"]').fill('Bob E2E');
        await page2.locator('input[name="email"]').fill('bob@example.com');

        // Submit both simultaneously
        await Promise.all([
          page1.locator('button[type="submit"]').click(),
          page2.locator('button[type="submit"]').click()
        ]);

        // One should succeed, one should show error
        const success1 = await page1.locator('text=Your request has been saved').isVisible();
        const success2 = await page2.locator('text=Your request has been saved').isVisible();

        const error1 = await page1.locator('text=This slot was just booked by someone else').isVisible();
        const error2 = await page2.locator('text=This slot was just booked by someone else').isVisible();

        expect((success1 && error2) || (success2 && error1)).toBe(true);
      }
    }

    await context1.close();
    await context2.close();
  });
});
