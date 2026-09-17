import { test, expect } from '@playwright/test';

test.describe('Visio Booking Flow', () => {

  test('should complete the entire booking lifecycle: create, admin accept, verify, conflict, and mobile', async ({ browser }, testInfo) => {

    const projectSlug = testInfo.project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const meetingUrl =
      `https://meet.google.com/e2e-${projectSlug}-${testInfo.retry}`;

    // Complete isolation per user: User 1 and User 2
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // 1. & 2. Affichage public FR & EN
    await page1.goto('/fr/contact');
    await expect(page1.locator('#visio-booking-section')).toBeVisible();

    await page1.goto('/en/contact');
    await expect(page1.locator('#visio-booking-section')).toBeVisible();

    // 3. Sélection date et heure
    const dateSelect = page1.locator('#visio-date');
    await expect(dateSelect).toBeVisible();

    // Check available options - MUST have at least one valid slot
    const dateOptions = await dateSelect.locator('option:not([disabled])').allInnerTexts();
    expect(dateOptions.length).toBeGreaterThan(0);

    // Select first valid date
    await dateSelect.selectOption({ index: 1 });
    const selectedDate = await dateSelect.inputValue(); // YYYY-MM-DD

    const timeSelect = page1.locator('#visio-time');
    await expect(timeSelect).toBeVisible();
    const timeOptions = await timeSelect.locator('option:not([disabled])').allInnerTexts();
    expect(timeOptions.length).toBeGreaterThan(0);

    await timeSelect.selectOption({ index: 1 });
    const selectedTime = await timeSelect.inputValue();

    // Setup page2 on same selection
    await page2.goto('/en/contact');
    await page2.locator('#visio-date').selectOption({ value: selectedDate });
    await page2.locator('#visio-time').selectOption({ value: selectedTime });

    // 4. Création d'une demande avec concurrence
    await page1.locator('#visio-names').fill('Alice E2E');
    await page1.locator('#visio-email').fill('alice.e2e@example.com');
    await page1.locator('#visio-formula').selectOption({ value: 'photo' });

    await page2.locator('#visio-names').fill('Bob E2E');
    await page2.locator('#visio-email').fill('bob.e2e@example.com');
    await page2.locator('#visio-formula').selectOption({ value: 'film' });

    // Soumettre presque en même temps
    const submitButton1 = page1.locator('#visio-booking-section button[type="submit"]');
    const submitButton2 = page2.locator('#visio-booking-section button[type="submit"]');

    // Start waiting for responses BEFORE clicking
    const responsePromise1 = page1.waitForResponse(r => r.url().includes('/api/booking') && r.request().method() === 'POST', { timeout: 20000 });
    const responsePromise2 = page2.waitForResponse(r => r.url().includes('/api/booking') && r.request().method() === 'POST', { timeout: 20000 });

    await Promise.all([
      submitButton1.click(),
      submitButton2.click()
    ]);

    const res1 = await responsePromise1;
    const res2 = await responsePromise2;

    // The responses indicate success or failure.

    // 8. Refus d'une deuxième réservation du même créneau
    const success1 = res1.status() === 201;
    const success2 = res2.status() === 201;
    const error1 = res1.status() === 409;
    const error2 = res2.status() === 409;

    // Exactly one should succeed, exactly one should fail due to slot taken
    expect((success1 && error2) || (success2 && error1)).toBe(true);

    // Identify winner
    const loserPage = success1 ? page2 : page1;
    const winnerName = success1 ? 'Alice E2E' : 'Bob E2E';

    // The slot should not be available anymore for the loser after refresh
    await loserPage.reload();
    // After reload, the booked date may or may not still appear (if it has other time slots).
    // Check if selectedDate is still an option; if so, select it and verify time is gone.
    const dateStillAvailable = await loserPage.locator(`#visio-date option[value="${selectedDate}"]`).count();
    if (dateStillAvailable > 0) {
      await loserPage.locator('#visio-date').selectOption({ value: selectedDate });
      const availableTimeValues: string[] = [];
      const timeOpts = await loserPage.locator('#visio-time option').all();
      for (const opt of timeOpts) {
        const val = await opt.getAttribute('value');
        if (val) availableTimeValues.push(val);
      }
      expect(availableTimeValues).not.toContain(selectedTime);
    }
    // If date is gone entirely, the slot is also gone — that's fine.

    // 5. Apparition dans l'administration
    const contextAdmin = await browser.newContext();
    const adminPage = await contextAdmin.newPage();
    await adminPage.goto('/admin');
    await adminPage.locator('input[name="password"]').fill('e2e_password');
    await adminPage.locator('button[type="submit"]').click();
    await expect(adminPage.locator('h1')).toContainText('Administration Sempra');

    await adminPage.goto('/admin/bookings');
    await adminPage.waitForLoadState('networkidle');
    await expect(adminPage.getByText(winnerName).first()).toBeVisible({ timeout: 10000 });

    // 6. Acceptation avec un lien visio (Invalid first)
    const acceptBtn = adminPage.locator('button:has-text("Accepter")').first();
    await expect(acceptBtn).toBeVisible();
    await expect(acceptBtn).toBeEnabled();
    await acceptBtn.click();
    await expect(adminPage.locator('[role="dialog"]')).toBeVisible();

    await adminPage.locator('input[name="meeting_url"]').fill('https://example.com/fake');
    const badResponsePromise = adminPage.waitForResponse(r => (r.url().includes('/admin/bookings') || r.url().includes('_data')) && r.request().method() === 'POST');
    await adminPage.locator('[role="dialog"] button[type="submit"]').click();
    const badRes = await badResponsePromise;
    expect(badRes.status()).toBe(400);

    await expect(adminPage.locator('[role="dialog"]')).toBeVisible();
    await expect(adminPage.locator('[role="alert"]')).toBeVisible();
    await expect(adminPage.locator("[style]")).toHaveCount(0);

    // 7. Acceptation réussie
    await adminPage.locator('input[name="meeting_url"]').fill(meetingUrl);
    const goodResponsePromise = adminPage.waitForResponse(r => (r.url().includes('/admin/bookings') || r.url().includes('_data')) && r.request().method() === 'POST');
    await adminPage.locator('[role="dialog"] button[type="submit"]').click();

    // La modale reste visible pendant l'envoi
    await expect(adminPage.locator('[role="dialog"]')).toBeVisible();

    const goodRes = await goodResponsePromise;
    expect(goodRes.status()).toBe(200);

    // Attendre la fermeture de la modale
    await expect(adminPage.locator('[role="dialog"]')).toBeHidden();

    // Vérifier onglet Confirmés
    await adminPage.locator('button:has-text("Confirmés")').click();
    
    const confirmedLink = adminPage.locator(`a[href="${meetingUrl}"]`);

    await expect(confirmedLink).toHaveCount(1);
    await expect(confirmedLink).toBeVisible();

    const confirmedCard = confirmedLink.locator("xpath=ancestor::div[1]");
    await expect(confirmedCard).toContainText(winnerName);

    // 11. Affichage mobile correct
    await page1.setViewportSize({ width: 375, height: 667 });
    await page1.goto('/en/contact');
    await expect(page1.locator('#visio-booking-section')).toBeVisible();
    const selectBox = await page1.locator('#visio-date').boundingBox();
    expect(selectBox?.width).toBeLessThanOrEqual(375); // Ensure it doesn't overflow

    await context1.close();
    await context2.close();
    await contextAdmin.close();
  });
});
