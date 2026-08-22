import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultContentPath = path.resolve(__dirname, '../app/content/default-site-content.json');
const defaultContent = JSON.parse(fs.readFileSync(defaultContentPath, 'utf8'));

test.describe('Admin Content Management (Phase 3B)', () => {

  test.beforeAll(() => {
    expect(process.env.SITE_CONTENT_PATH).toBeDefined();
    expect(process.env.SITE_CONTENT_PATH).toContain('timeless-e2e-');
    expect(process.env.SITE_CONTENT_PATH).not.toContain('./data');
  });

  test.beforeEach(async ({ page }) => {
    if (process.env.SITE_CONTENT_PATH) {
      fs.writeFileSync(process.env.SITE_CONTENT_PATH, JSON.stringify(defaultContent, null, 2));
    }
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

    // Click on the 'Photographie' tab to make sure it's visible
    await page.click('button:has-text("Photographie")');

    // Find the photo category
    const photoSection = page.locator('section').filter({ hasText: 'Photographie' }).first();
    // Verify the price is 1 300 €
    await expect(photoSection).toContainText('1 300 €');

    // Verify on public page (EN)
    await page.goto('/en/pricing');
    await page.click('button:has-text("Photography")');
    const photoSectionEn = page.locator('section').filter({ hasText: 'Photography' }).first();
    await expect(photoSectionEn).toContainText(/1[.,\s\xA0]*300/);
  });

  test('should edit settings and see changes on contact page', async ({ page }) => {
    await page.click('text=Textes et informations');
    await expect(page.locator('h1')).toContainText('Textes et informations');

    // Change Email
    await page.fill('input[name="email"]', 'new-contact@example.com', { strict: false });

    // Change Phone
    await page.fill('input[name="phoneDisplay"]', '+33 6 12 34 56 78', { strict: false });
    await page.fill('input[name="phoneE164"]', '+33612345678', { strict: false });

    // Submit
    await page.click('button[type="submit"]');
    await expect(page.locator('div[role="status"]')).toContainText('Informations mises à jour avec succès.');

    // Verify on contact page FR
    await page.goto('/fr/contact');
    await expect(page.locator('a[href="mailto:new-contact@example.com"]').first()).toBeVisible();
    await expect(page.locator('a[href="tel:+33612345678"]').first()).toContainText('+33 6 12 34 56 78');

    // Verify on contact page EN
    await page.goto('/en/contact');
    await expect(page.locator('a[href="mailto:new-contact@example.com"]').first()).toBeVisible();
    await expect(page.locator('a[href="tel:+33612345678"]').first()).toContainText('+33 6 12 34 56 78');

    // Verify Footer
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
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
    fs.writeFileSync(process.env.SITE_CONTENT_PATH!, '{ corrupted json');

    // Go to admin pricing
    await page.goto('/admin/pricing');

    // Check for the error message
    await expect(page.locator('div[role="alert"]')).toContainText('Le stockage du contenu doit être vérifié avant toute modification.');

    // Check submit is disabled
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeDisabled();

    // Check settings as well
    await page.goto('/admin/settings');
    await expect(page.locator('div[role="alert"]')).toContainText('Le stockage du contenu doit être vérifié avant toute modification.');
    await expect(page.locator('button[type="submit"]')).toBeDisabled();

    // Restore file so parallel tests don't fail
    fs.writeFileSync(process.env.SITE_CONTENT_PATH!, JSON.stringify(defaultContent, null, 2));
  });

});
