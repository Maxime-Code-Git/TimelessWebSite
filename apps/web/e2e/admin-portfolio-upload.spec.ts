import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test.describe('Admin Portfolio Upload and Publish (Phase 3C.2B)', () => {
  let validJpegBuffer: Buffer;

  test.beforeAll(async () => {
    validJpegBuffer = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    }).jpeg().toBuffer();
  });

  test('should completely manage project with uploads, media route, and publication', async ({ page }) => {
    test.setTimeout(60000); // Allow more time for uploads

    page.on('console', msg => console.log(`BROWSER CONSOLE: ${msg.type()} - ${msg.text()}`));
    page.on('pageerror', error => console.log(`BROWSER ERROR: ${error.message}`));

    // 1. Login
    await page.goto('/admin');
    const passwordInput = page.locator('input[name="password"]');
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('e2e_password');
      await page.click('button:has-text("Se connecter")');
      await expect(page.locator('h1')).toHaveText('Administration Timeless');
    }

    const uniqueId = Date.now().toString() + Math.floor(Math.random() * 1000);
    const titleFr = `Projet Complet FR ${uniqueId}`;
    const titleEn = `Complete Project EN ${uniqueId}`;

    // 2. Create a project with auto-slug
    await page.click('a[href="/admin/portfolio"]');
    await page.click('a[href="/admin/portfolio/new"]');
    await page.fill('input[name="titleFr"]', titleFr);
    await page.fill('input[name="titleEn"]', titleEn);
    await page.fill('textarea[name="descriptionFr"]', 'Desc FR complète');
    await page.fill('textarea[name="descriptionEn"]', 'Desc EN complète');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/admin/portfolio');
    await expect(page.locator('h3', { hasText: `${titleFr} / ${titleEn}` }).first()).toBeVisible();

    // 3. Enter edit mode
    const projectCard1 = page.locator('div', { has: page.locator('h3', { hasText: `${titleFr} / ${titleEn}` }) }).first();
    await projectCard1.locator('a:has-text("Modifier")').first().click();
    await expect(page.locator('h1')).toHaveText('Modifier le Projet');

    // Test 405 on upload route with real HTTP requests
    const uploadUrl = page.url() + '/upload';
    for (const method of ['get', 'put', 'patch', 'delete'] as const) {
      const resp = await page.request[method](uploadUrl);
      expect(resp.status()).toBe(405);
      expect(resp.headers()['allow']).toBe('POST');
    }

    // Ensure "Publier le projet" button is disabled
    const publishBtn = page.locator('button:has-text("Publier le projet")');
    await expect(publishBtn).toBeDisabled();

    // 4. Generate two valid images in memory and use setInputFiles
    // In our UI, there is an input[type="file"] ref that is hidden, triggered by a button.
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("Sélectionner des photos")');
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles([
      { name: 'photo1.jpg', mimeType: 'image/jpeg', buffer: validJpegBuffer },
      { name: 'photo2.jpg', mimeType: 'image/jpeg', buffer: validJpegBuffer },
    ]);

    // Wait for processing to finish (we should see two "Modifier" buttons indicating two photos were added)
    // Wait for processing to finish (we should see two "Modifier" buttons indicating two photos were added, OR an error)
    await expect(
      page.locator('button:has-text("Modifier")').first().or(page.locator('div[class*="error"] p').first())
    ).toBeVisible({ timeout: 10000 });

    const errorToast = page.locator('div[class*="error"] p');
    if (await errorToast.count() > 0) {
      console.log("UPLOAD UI ERROR:", await errorToast.first().textContent());
      throw new Error("Upload failed: " + await errorToast.first().textContent());
    }

    await expect(page.locator('button:has-text("Modifier")')).toHaveCount(2);

    // 5. Verify the two photos are shown via admin media route
    const images = page.locator('img[src*="/admin/portfolio/media/"]');
    await expect(images).toHaveCount(2);

    // Also verify the HTTP response of one of these images returns a 200 via the media route
    const imgSrc = await images.first().getAttribute('src');
    expect(imgSrc).not.toBeNull();
    const response = await page.request.get(imgSrc!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/webp');
    expect(response.headers()['cache-control']).toBe('no-store, max-age=0');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');

    // Trying to access original should return 404
    const originalSrc = imgSrc!.replace('480p', 'original');
    const originalResponse = await page.request.get(originalSrc);
    expect(originalResponse.status()).toBe(404);

    // Trying to access without session should fail
    const context = await page.context().browser()!.newContext();
    const anonPage = await context.newPage();
    const anonResponse = await anonPage.goto(new URL(imgSrc!, page.url()).toString());
    expect(anonResponse?.status()).toBe(401);
    await context.close();

    // 6. Verify that the first photo is automatically the cover
    const coverSpan = page.locator('span', { hasText: 'Couverture' });
    await expect(coverSpan).toHaveCount(1);

    // 7. Change the cover to the second photo
    // The second photo has a "Couverture" button
    await page.click('button:has-text("Couverture")');
    // Now there should still be only 1 cover span
    await expect(page.locator('span', { hasText: 'Couverture' })).toHaveCount(1);

    // 8. Edit categories and alt texts
    let currentPhoto = 1;
    const editDialogHandler = async (dialog: import('@playwright/test').Dialog) => {
      const msg = dialog.message();
      if (msg.includes('Catégorie')) {
        await dialog.accept(currentPhoto === 1 ? 'ceremony' : 'reception');
      } else if (msg.includes('FR')) {
        await dialog.accept(currentPhoto === 1 ? 'Alt FR 1' : 'Alt FR 2');
      } else if (msg.includes('EN')) {
        await dialog.accept(currentPhoto === 1 ? 'Alt EN 1' : 'Alt EN 2');
      } else {
        await dialog.accept();
      }
    };
    page.on('dialog', editDialogHandler);

    // For the first photo
    await page.locator('button:has-text("Modifier")').first().click();
    await expect(page.locator('text="ceremony"').first()).toBeVisible();
    await expect(page.locator('text="Alt FR 1"').first()).toBeVisible();

    // For the second photo
    currentPhoto = 2;
    await page.locator('button:has-text("Modifier")').nth(1).click();
    await expect(page.locator('text="reception"').first()).toBeVisible();

    page.off('dialog', editDialogHandler);

    // 9. Reorder the photos
    // Verify first photo is Ceremony, second is Reception
    await expect(page.locator('img ~ div p strong').first()).toHaveText('ceremony');
    // Click 'Descendre' on the first photo
    await page.locator('button[title="Descendre"]').first().click();
    // Now the first should be reception
    await expect(page.locator('img ~ div p strong').first()).toHaveText('reception');

    // 10. Save textual modifications
    await page.fill('input[name="titleFr"]', `${titleFr} Modifié`);
    await page.click('button:has-text("Enregistrer les modifications")');

    // 11. Publish the project
    // Check that publish button is now enabled
    await expect(publishBtn).toBeEnabled();
    await publishBtn.click();

    // Redirects to dashboard
    await expect(page).toHaveURL('/admin/portfolio');
    await expect(page.locator('text="published"').first()).toBeVisible();

    // 12. Unpublish (Repasser en brouillon)
    const projectCard2 = page.locator('div', { has: page.locator('h3', { hasText: `${titleFr} Modifié` }) }).first();
    await projectCard2.locator('a:has-text("Modifier")').first().click();
    await page.click('button:has-text("Repasser en brouillon")');
    await expect(page).toHaveURL('/admin/portfolio');
    await expect(page.locator('text="draft"').first()).toBeVisible();

    // 13. Delete a photo (not cover)
    const projectCard3 = page.locator('div', { has: page.locator('h3', { hasText: `${titleFr} Modifié` }) }).first();
    await projectCard3.locator('a:has-text("Modifier")').first().click();

    // Check we cannot delete the cover photo
    let dialogFired = false;
    page.once('dialog', async dialog => {
      dialogFired = true;
      expect(dialog.message()).toContain('Impossible de supprimer la photo de couverture');
      await dialog.accept();
    });
    // The cover card does NOT have a button "Couverture", but it has the text span.
    // We can just find the "Supprimer" button that is NOT a sibling of a "Couverture" button?
    // Actually, each photo card has a "Modifier" button.
    const allCards = page.locator('button:has-text("Modifier")').locator('..').locator('..');
    // The cover card is the one with the 'span:has-text("Couverture")'
    const coverCard = allCards.filter({ has: page.locator('span:has-text("Couverture")') });
    await coverCard.locator('button:has-text("Supprimer")').click();
    expect(dialogFired).toBe(true);

    // Delete the non-cover photo
    page.once('dialog', async dialog => await dialog.accept());
    const nonCoverCard = allCards.filter({ has: page.locator('button:has-text("Couverture")') }).first();
    await nonCoverCard.locator('button:has-text("Supprimer")').click();

    // Verify it was deleted (count should be 1)
    await expect(page.locator('button:has-text("Modifier")')).toHaveCount(1);
  });
});
