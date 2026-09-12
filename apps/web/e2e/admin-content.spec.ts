import { test, expect } from '@playwright/test';

import { restoreDefaultSiteContent, writeSiteContent } from './test-helpers';

test.describe('Admin Content Management (Phase 3B)', () => {

  test.beforeAll(() => {
    // Rely on test-helpers for path validation.
  });

  test.beforeEach(async ({ page }) => {
    restoreDefaultSiteContent();
    // Login before each test
    await page.goto('/admin');
    await page.fill('input[name="password"]', 'e2e_password');
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toContainText('Administration Sempra');
  });

  test.afterEach(() => {
    restoreDefaultSiteContent();
  });

    test('should edit pricing and see changes on public pages', async ({ page }) => {
    await page.click('text=Formules et tarifs');
    await expect(page.locator('h1')).toContainText('Formules et tarifs');

    // Click on Photographie tab in Admin
    await page.click('button:has-text("PHOTO")');

    // Find the first formula card's price input (Essential)
    // The price input has a label "Prix (€)"
    const firstFormulaPrice = page.locator('input[type="number"]').first();
    await firstFormulaPrice.fill('1300');

    // Select it as featured
    const firstFormulaFeatured = page.locator('label:has-text("Mettre en avant")').first().locator('input[type="radio"]');
    await firstFormulaFeatured.check();

    // Submit
    await page.click('button[type="submit"]');
    await expect(page.locator('div[role="status"]')).toContainText('Tarifs mis à jour avec succès.');

    // Verify on public page (FR)
    await page.goto('/fr/formules');
    await page.click('button:has-text("Photographie")');
    await expect(page.locator('body')).toContainText('1 300 €');

    // Verify on public page (EN)
    await page.goto('/en/pricing');
    await page.click('button:has-text("Photography")');
    await expect(page.locator('body')).toContainText(/1[.,\s\xA0]*300/);
  });

  test('should edit settings and see changes on contact page', async ({ page }) => {
    await page.click('text=Textes et informations');
    await expect(page.locator('h1')).toContainText('Textes et informations');

    const form = page.locator('form');
    // Change Email
    await form.locator('input[name="email"]').fill('new-contact@example.com');

    // Change Phone
    await form.locator('input[name="phoneDisplay"]').fill('+33 6 12 34 56 78');
    await form.locator('input[name="phoneE164"]').fill('+33612345678');

    // Submit
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('div[role="status"]')).toContainText('Informations mises à jour avec succès.');

    // Verify on contact page FR
    await page.goto('/fr/contact');
    await expect(page.locator('main a[href="mailto:new-contact@example.com"]').first()).toBeVisible();
    await expect(page.locator('main a[href="tel:+33612345678"]').first()).toContainText('+33 6 12 34 56 78');

    // Verify on contact page EN
    await page.goto('/en/contact');
    await expect(page.locator('main a[href="mailto:new-contact@example.com"]').first()).toBeVisible();
    await expect(page.locator('main a[href="tel:+33612345678"]').first()).toContainText('+33 6 12 34 56 78');

    // Verify Footer realistically
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    await expect(footer.locator('a[href="mailto:new-contact@example.com"]')).toBeVisible();
    await expect(footer.locator('a[href="tel:+33612345678"]')).toContainText('+33 6 12 34 56 78');
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
        'Origin': 'http://localhost:4174'
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

  test('should display warning and disable submit when JSON is corrupted', async ({ page }) => {
    // Corrupt the JSON file directly
    writeSiteContent('{ corrupted json');

      // Go to admin pricing
      await page.goto('/admin/pricing');

      // Check for the error message
      await expect(page.locator('div[role="alert"]')).toContainText('Le stockage du contenu doit être vérifié avant toute modification.');

      // Check submit is disabled
      const submitBtn = page.locator('form button[type="submit"]');
      await expect(submitBtn).toBeDisabled();

      // Check settings as well
      await page.goto('/admin/settings');
      await expect(page.locator('div[role="alert"]')).toContainText('Le stockage du contenu doit être vérifié avant toute modification.');
    await expect(page.locator('form button[type="submit"]')).toBeDisabled();
  });

});
