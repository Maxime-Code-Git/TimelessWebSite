import { test, expect } from '@playwright/test';

test.describe('Admin Contact End-to-End', () => {
  test('authenticates, modifies content, verifies persistance and public visibility, then restores', async ({ page }) => {
    await page.goto("/admin");
    await page.getByLabel("Mot de passe").fill("e2e_password");
    await page.getByRole("button", { name: "Se connecter" }).click();

    await expect(
      page.getByRole("heading", { name: "Administration Sempra" })
    ).toBeVisible();

    await expect(page.getByText("Vous êtes connecté")).toBeVisible();

    await page.getByRole("link", { name: /Page Contact/ }).click();

    await expect(page).toHaveURL(/\/admin\/contact$/);
    await expect(
      page.getByRole("heading", { name: "Page Contact" })
    ).toBeVisible();

    // Read original values FR
    await page.click('button:has-text("Français")');
    const titleFrInput = page.getByLabel('Titre principal');
    const seoTitleFrInput = page.getByLabel('Titre SEO');
    const seoDescFrInput = page.getByLabel('Description SEO');

    const originalTitleFr = await titleFrInput.inputValue();
    const originalSeoTitleFr = await seoTitleFrInput.inputValue();
    const originalSeoDescFr = await seoDescFrInput.inputValue();

    // Read original values EN
    await page.click('button:has-text("English")');
    const titleEnInput = page.getByLabel('Titre principal');
    const seoTitleEnInput = page.getByLabel('Titre SEO');
    const seoDescEnInput = page.getByLabel('Description SEO');

    const originalTitleEn = await titleEnInput.inputValue();
    const originalSeoTitleEn = await seoTitleEnInput.inputValue();
    const originalSeoDescEn = await seoDescEnInput.inputValue();

    const timestamp = Date.now();
    const newTitleFr = `Titre FR ${timestamp}`;
    const newTitleEn = `Title EN ${timestamp}`;
    const newSeoTitleFr = `SEO FR ${timestamp}`;
    const newSeoTitleEn = `SEO EN ${timestamp}`;
    const newSeoDescFr = `Desc FR ${timestamp}`;
    const newSeoDescEn = `Desc EN ${timestamp}`;

    try {
      // Modify EN values
      await titleEnInput.fill(newTitleEn);
      await seoTitleEnInput.fill(newSeoTitleEn);
      await seoDescEnInput.fill(newSeoDescEn);

      // Modify FR values
      await page.click('button:has-text("Français")');
      await titleFrInput.fill(newTitleFr);
      await seoTitleFrInput.fill(newSeoTitleFr);
      await seoDescFrInput.fill(newSeoDescFr);

      const [response] = await Promise.all([
        page.waitForResponse(res => res.url().includes('/admin/contact') && res.request().method() === 'POST'),
        page.click('button[type="submit"]')
      ]);
      expect(response.status()).toBe(200);

      await page.goto('/admin/contact');

      // Verify FR explicitly
      await page.click('button:has-text("Français")');
      await expect(titleFrInput).toHaveValue(newTitleFr);

      // Verify EN explicitly
      await page.click('button:has-text("English")');
      await expect(titleEnInput).toHaveValue(newTitleEn);

      // Verify Public FR
      await page.goto('/fr/contact');
      await expect(page.locator('h1')).toContainText(newTitleFr);
      await expect(page).toHaveTitle(newSeoTitleFr);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', newSeoDescFr);

      // Verify Public EN
      await page.goto('/en/contact');
      await expect(page.locator('h1')).toContainText(newTitleEn);
      await expect(page).toHaveTitle(newSeoTitleEn);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', newSeoDescEn);

    } finally {
      // Restore Original Values
      await page.goto('/admin/contact');

      await page.click('button:has-text("Français")');
      await page.getByLabel('Titre principal').fill(originalTitleFr);
      await page.getByLabel('Titre SEO').fill(originalSeoTitleFr);
      await page.getByLabel('Description SEO').fill(originalSeoDescFr);

      await page.click('button:has-text("English")');
      await page.getByLabel('Titre principal').fill(originalTitleEn);
      await page.getByLabel('Titre SEO').fill(originalSeoTitleEn);
      await page.getByLabel('Description SEO').fill(originalSeoDescEn);

      const [restoreResponse] = await Promise.all([
        page.waitForResponse(res => res.url().includes('/admin/contact') && res.request().method() === 'POST'),
        page.click('button[type="submit"]')
      ]);
      expect(restoreResponse.status()).toBe(200);
    }
  });
});
