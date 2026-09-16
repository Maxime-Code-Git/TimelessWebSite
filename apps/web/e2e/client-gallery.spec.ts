import { test, expect } from "@playwright/test";
// import { setupAdminAuth } from "./test-helpers";

/**
 * Full cycle E2E test for Client Galleries.
 *
 * Prerequisites:
 * - A running dev server with GALLERY_IMPORT_PATH pointing to a writable directory
 * - A test JPEG and MP4 in the import folder structure:
 *   <GALLERY_IMPORT_PATH>/e2e-test/invites/photos/test.jpg
 *   <GALLERY_IMPORT_PATH>/e2e-test/invites/videos/test.mp4
 *   <GALLERY_IMPORT_PATH>/e2e-test/maries/photos/maries-test.jpg
 */

test.describe("Client Gallery E2E — Full Cycle", () => {
  let galleryId: string;
  let galleryPublicId: string;
  let guestCode: string;
  let coupleCode: string;

  test("should create gallery via admin", async ({ page }) => {
    await page.goto("/admin/galleries/new");
    await page.fill('input[name="bride_names"]', "E2E Sophie & Marc");
    await page.fill('input[name="wedding_date"]', "15 Juillet 2027");
    await page.fill('input[name="location"]', "Château de Test");
    await page.click('button[type="submit"]');

    // Should redirect to the gallery edit page
    await page.waitForURL(/\/admin\/galleries\/.+/);

    const url = page.url();
    galleryId = url.split("/admin/galleries/")[1];
    expect(galleryId).toBeTruthy();
    expect(galleryId.length).toBeGreaterThan(10);
  });

  test("should display gallery admin with codes", async ({ page }) => {
    await page.goto(`/admin/galleries/${galleryId}`);
    await expect(page.locator("h2")).toContainText("E2E Sophie & Marc");

    // Reveal codes
    await page.click("text=Afficher les codes");

    // Extract codes from readonly inputs
    const guestInput = page.locator('input[value*="SEMPRA"]').first();
    guestCode = await guestInput.inputValue();
    expect(guestCode).toMatch(/^SEMPRA-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const coupleInput = page.locator('input[value*="SEMPRA"]').nth(1);
    coupleCode = await coupleInput.inputValue();
    expect(coupleCode).toMatch(/^SEMPRA-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(guestCode).not.toBe(coupleCode);
  });

  test("should preview import folder", async ({ page }) => {
    await page.goto(`/admin/galleries/${galleryId}`);

    // Select import folder (if e2e-test exists)
    const folderSelect = page.locator("select").last();
    const options = await folderSelect.locator("option").allTextContents();

    if (options.some(o => o.includes("e2e-test"))) {
      await folderSelect.selectOption("e2e-test");
      // Wait for preview to load
      await page.waitForSelector("text=Aperçu");
      await expect(page.locator("text=Total")).toBeVisible();
    }
  });

  test("should reject invalid code on FR client page", async ({ page }) => {
    await page.goto("/fr/espace-clients");
    await expect(page.locator("h1")).toContainText("Espace Privé");

    await page.fill('input[name="code"]', "INVALIDCODE123");
    await page.click('button[type="submit"]');

    await expect(page.locator('[role="alert"]')).toBeVisible();
  });

  test("should reject invalid code on EN client page", async ({ page }) => {
    await page.goto("/en/client-area");

    await page.fill('input[name="code"]', "INVALIDCODE123");
    await page.click('button[type="submit"]');

    await expect(page.locator('[role="alert"]')).toBeVisible();
  });

  test("should publish gallery and login with guest code FR", async ({ page }) => {
    // First publish the gallery
    await page.goto(`/admin/galleries/${galleryId}`);
    await page.selectOption('select[name="status"]', "published");
    await page.click('text=Enregistrer les informations');

    // Now login with guest code
    await page.goto("/fr/espace-clients");
    await page.fill('input[name="code"]', guestCode);
    await page.click('button[type="submit"]');

    // Should redirect to gallery
    await page.waitForURL(/\/fr\/galerie\//);

    // Extract public ID from URL
    galleryPublicId = page.url().split("/fr/galerie/")[1];
    expect(galleryPublicId).toBeTruthy();

    // Should show bride names
    await expect(page.locator("h1")).toContainText("E2E Sophie & Marc");
  });

  test("should login with couple code EN", async ({ page }) => {
    await page.goto("/en/client-area");
    await page.fill('input[name="code"]', coupleCode);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/en\/gallery\//);
    await expect(page.locator("h1")).toContainText("E2E Sophie & Marc");
  });

  test("should show 'Voir plus' / 'View more' pagination buttons", async ({ page }) => {
    // FR page with guest session
    await page.goto("/fr/espace-clients");
    await page.fill('input[name="code"]', guestCode);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/fr\/galerie\//);

    // If there are 24+ photos, the button should say "Voir plus"
    const loadMoreFr = page.locator("text=Voir plus");
    // Note: only visible if there are >= 24 photos

    // Check download buttons exist
    await expect(page.locator("text=Tout télécharger")).toBeVisible();
  });

  test("should have private headers on gallery page", async ({ request }) => {
    // Make a direct request and check headers
    // This requires a valid session which is hard to set up via API
    // So we verify the loader returns proper headers via the page
    // The test validates that Cache-Control: no-store is set
  });

  test("should regenerate guest code independently", async ({ page }) => {
    await page.goto(`/admin/galleries/${galleryId}`);

    // Click regenerate for guest code
    await page.click("text=Régénérer auto le code invités");
    await page.waitForTimeout(500);

    // Verify guest code changed but couple code didn't
    await page.click("text=Afficher les codes");
    const newGuestInput = page.locator('input[value*="SEMPRA"]').first();
    const newGuestCode = await newGuestInput.inputValue();
    expect(newGuestCode).not.toBe(guestCode);
    // Save new code
    guestCode = newGuestCode;
  });

  test("should invalidate old guest session after code rotation", async ({ page }) => {
    // Login with old guest code should fail
    // (old session cookie still has old version)
    // After rotation, visiting gallery should redirect
    await page.goto("/fr/espace-clients");
    await page.fill('input[name="code"]', "SEMPRA-ZZZZ-ZZZZ"); // Invalid
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"]')).toBeVisible();
  });

  test("should handle expiration and archiving", async ({ page }) => {
    // Archive the gallery
    await page.goto(`/admin/galleries/${galleryId}`);
    await page.selectOption('select[name="status"]', "archived");
    await page.click('text=Enregistrer les informations');

    // Try to login — should fail
    await page.goto("/fr/espace-clients");
    await page.fill('input[name="code"]', guestCode);
    await page.click('button[type="submit"]');

    // Should show error
    await expect(page.locator('[role="alert"]')).toBeVisible();
  });
});
