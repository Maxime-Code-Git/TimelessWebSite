import { test, expect } from '@playwright/test';
import { setupAdminAuth } from './test-helpers';
import crypto from "node:crypto";

test.describe('Client Gallery E2E', () => {
  let galleryId: string;
  let guestCode: string;
  let coupleCode: string;

  test.beforeAll(async ({ request }) => {
    // Setup a gallery for testing through the API
    await setupAdminAuth(request);

    const formData = new FormData();
    formData.append('intent', 'create');
    formData.append('bride_names', 'E2E Test Brides');
    formData.append('wedding_date', '2027-01-01');

    const res = await request.post('/admin/galleries/new', {
      multipart: {
        intent: 'create',
        bride_names: 'E2E Test Brides',
        wedding_date: '2027-01-01',
      }
    });

    // In a real test, we'd mock or extract the created gallery ID and codes
    // For simplicity, we just verify the client login page loads
  });

  test('should display client gallery login and reject invalid codes', async ({ page }) => {
    await page.goto('/fr/espace-clients');
    await expect(page.locator('h1')).toHaveText('Votre Espace Privé');

    await page.fill('input[name="code"]', 'INVALIDCODE123');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Code introuvable ou galerie expirée.')).toBeVisible();
  });
});
