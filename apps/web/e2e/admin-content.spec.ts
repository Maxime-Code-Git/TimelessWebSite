import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const testDbPath = './data/db/rate-limit-test.sqlite';
const dataPath = './data/site-content.json';

// Cleanup the temp site-content before tests
test.beforeAll(() => {
  try {
    fs.unlinkSync(dataPath);
  } catch (e) {
    // Ignore
  }
});

test.describe('Admin Content Management (Phase 3B)', () => {

  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/admin');
    await page.fill('input[name="password"]', 'e2e_password');
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toContainText('Administration Timeless');
  });

  test('should edit pricing and see changes on public pages', async ({ page }) => {
    await page.click('text=Formules et tarifs');
    await expect(page.locator('h1')).toContainText('Formules et tarifs');

    // Change price for photo essential formula
    const photoEssentialPriceInput = page.locator('table').nth(0).locator('tbody tr').nth(0).locator('input[type="number"]');

    // Clear and type new price
    await photoEssentialPriceInput.fill('1300');

    // Select it as featured
    const photoEssentialFeaturedRadio = page.locator('table').nth(0).locator('tbody tr').nth(0).locator('input[type="radio"]');
    await photoEssentialFeaturedRadio.check();

    // Submit
    await page.click('button[type="submit"]');
    await expect(page.locator('div[role="status"]')).toContainText('Tarifs mis à jour avec succès.');

    // Verify on public page (FR)
    await page.goto('/fr/formules');

    // Find the photo category
    const photoSection = page.locator('section').filter({ hasText: 'Photographie' }).first();
    // Verify the price is 1 300 €
    await expect(photoSection).toContainText('1 300 €');

    // The featured badge might be visible for Essential
    // Just ensuring we don't get 500s is also part of it.
  });

  test('should edit settings and see changes on contact page', async ({ page, context }) => {
    await page.click('text=Textes et informations');
    await expect(page.locator('h1')).toContainText('Textes et informations');

    // Change Email
    await page.fill('input[name="email"]', 'new-contact@example.com');

    // Change Phone
    await page.fill('input[name="phoneDisplay"]', '+33 6 12 34 56 78');
    await page.fill('input[name="phoneE164"]', '+33612345678');

    // Submit
    await page.click('button[type="submit"]');
    await expect(page.locator('div[role="status"]')).toContainText('Informations mises à jour avec succès.');

    // Verify on contact page
    await page.goto('/fr/contact');
    await expect(page.locator('a[href="mailto:new-contact@example.com"]')).toBeVisible();
    await expect(page.locator('a[href="tel:+33612345678"]')).toContainText('+33 6 12 34 56 78');
  });

  test('should handle revision conflicts (409)', async ({ page, request }) => {
    await page.click('text=Textes et informations');
    await expect(page.locator('h1')).toContainText('Textes et informations');

    // Simulate another user changing the file behind the scenes by using the API context
    // Wait, we need an admin session for the API request. We can just use the page's cookies.
    const cookies = await page.context().cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    // Get the current csrfToken from the form
    const csrfToken = await page.locator('input[name="csrfToken"]').inputValue();

    // Submit a mutation via request with the same revision to "steal" it
    const revision = await page.locator('input[name="revision"]').inputValue();

    // A valid business object
    const businessData = {
        email: "stolen@example.com",
        phoneDisplay: null,
        phoneE164: null,
        address: null,
        enterpriseNumber: null,
        legalForm: null,
        legalRepresentative: null,
        hostingProvider: null,
        hostingAddress: null,
        depositPercent: 30,
        instagramUrl: null,
        linkedinUrl: null,
        serviceArea: { fr: "Test FR", en: "Test EN" }
    };

    const res = await request.post('/admin/settings', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieString,
        'Origin': 'http://localhost:4173'
      },
      data: new URLSearchParams({
        csrfToken,
        revision,
        business: JSON.stringify(businessData)
      }).toString()
    });

    expect(res.status()).toBe(200);

    // Now try to submit the form in the browser, which still has the old revision
    await page.fill('input[name="email"]', 'fail@example.com');
    await page.click('button[type="submit"]');

    // Should see a 409 error message
    await expect(page.locator('div[role="alert"]')).toContainText('Conflit de révision');
  });

});
