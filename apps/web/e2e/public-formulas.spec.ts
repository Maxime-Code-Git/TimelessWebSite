import { test, expect } from '@playwright/test';

test.describe('Public Formulas & Admin Propagation', () => {
  test.afterEach(async ({ page }) => {
    try {
      // Clean up: Delete added item, re-enable photo-signature, restore text
      await page.goto('/admin');
      await page.goto('/admin/pricing');

      const essentialFormula = page.getByTestId('formula-card-photo-essential');

      // Delete "Test Propagation FR" if exists
      const testInputs = essentialFormula.locator('input[value="Test Propagation FR"]');
      if (await testInputs.count() > 0) {
        const row = testInputs.first().locator('..');
        await row.locator('button[aria-label="Supprimer cet élément"]').click();
      }

      // Restore Name
      await essentialFormula.locator('label', { hasText: 'Nom (FR)' }).locator('..').locator('input').fill('Essentiel');
      // Restore Summary
      await essentialFormula.locator('label', { hasText: 'Résumé (FR)' }).locator('..').locator('input').fill('Les moments clés, en images.');
      // Restore Description
      await essentialFormula.locator('label', { hasText: 'Description complète (FR)' }).locator('..').locator('textarea').fill('Une présence discrète pour capturer l\'essentiel de votre mariage. Idéal pour les mariages intimes.');

      // Re-enable photo-signature
      const signatureFormula = page.getByTestId('formula-card-photo-signature');
      const checkbox = signatureFormula.locator('input[type="checkbox"]');
      if (!(await checkbox.isChecked())) {
        await checkbox.check();
      }

      await page.locator('button', { hasText: 'Enregistrer les modifications' }).first().click();
      await expect(page.locator('text=Tarifs mis à jour avec succès.')).toBeVisible({ timeout: 10000 });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('admin changes propagate to Home, Formules, and Contact, keeping ?formula= in URL across languages', async ({ page }) => {
    // 1. Admin login
    await page.goto('/admin');
    await page.fill('input[name="password"]', 'e2e_password');
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toContainText('Administration Sempra');

    // 2. Go to Pricing Admin
    await page.goto('/admin/pricing');
    await expect(page.locator('h1')).toContainText('Formules et tarifs');

    // 3. Edit Photo category, "Essentiel" formula
    const essentialFormula = page.getByTestId('formula-card-photo-essential');

    // Change Name, Summary, Description
    await essentialFormula.locator('label', { hasText: 'Nom (FR)' }).locator('..').locator('input').fill('Essentiel Modifié');
    await essentialFormula.locator('label', { hasText: 'Résumé (FR)' }).locator('..').locator('input').fill('Résumé Modifié');
    await essentialFormula.locator('label', { hasText: 'Description complète (FR)' }).locator('..').locator('textarea').fill('Description Modifiée');

    // Add a new included item
    await essentialFormula.locator('button', { hasText: '+ Ajouter un élément' }).click();
    const lastItemFr = essentialFormula.locator('input[placeholder="Élément (FR)"]').last();
    const lastItemEn = essentialFormula.locator('input[placeholder="Élément (EN)"]').last();
    await lastItemFr.fill('Test Propagation FR');
    await lastItemEn.fill('Test Propagation EN');

    // Disable "Signature" formula
    const signatureFormula = page.getByTestId('formula-card-photo-signature');
    await signatureFormula.locator('input[type="checkbox"]').uncheck();

    // 4. Submit changes
    await page.locator('button', { hasText: 'Enregistrer les modifications' }).first().click();
    await expect(page.locator('text=Tarifs mis à jour avec succès.')).toBeVisible({ timeout: 10000 });

    // 5. Check Home Page (FR) for summary and name
    await page.goto('/fr');
    await expect(page.getByText('Essentiel Modifié').first()).toBeVisible();
    await expect(page.getByText('Résumé Modifié').first()).toBeVisible();
    await expect(page.getByText('Signature').first()).not.toBeVisible();

    // 6. Check Formules Page (FR) for description, added item, and disappeared formula
    await page.goto('/fr/formules');
    await page.locator('button', { hasText: 'PHOTO' }).first().click();
    await expect(page.getByText('Essentiel Modifié').first()).toBeVisible();
    await expect(page.getByText('Description Modifiée').first()).toBeVisible();
    await expect(page.getByText('Test Propagation FR').first()).toBeVisible();
    await expect(page.getByText('Signature').first()).not.toBeVisible();

    // 7. Check Contact Page with URL Param (FR)
    await page.goto('/fr/contact?formula=photo-essential');
    await expect(page.locator('select[name="formula"]')).toHaveValue('photo-essential');

    // Switch to English and ensure ?formula= is kept
    await page.getByRole('link', { name: 'Switch to EN' }).click();

    await expect(page).toHaveURL(/.*\/en\/contact\?formula=photo-essential/);
    await expect(page.locator('select[name="formula"]')).toHaveValue('photo-essential');
  });
});
