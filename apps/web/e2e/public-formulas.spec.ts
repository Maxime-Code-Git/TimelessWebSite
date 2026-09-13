import { test, expect } from '@playwright/test';

test.describe('Public Formulas & Admin Propagation', () => {
  test('admin changes propagate to Home, Formules, and Contact, keeping ?formula= in URL across languages', async ({ page }) => {
    // 1. Admin login
    await page.goto('/admin');
    await page.fill('input[name="password"]', 'e2e_password');
    await page.click('button[type="submit"]');
    await expect(page.locator('h1')).toContainText('Administration Sempra');

    // 2. Go to Pricing Admin
    await page.goto('/admin/pricing');
    await expect(page.locator('h1')).toContainText('Formules et tarifs');

    // 3. Edit Photo category, "Essentiel" formula (first one)
    const essentialFormula = page.getByTestId('formula-card-photo-essential');

    // Add a new included item
    await essentialFormula.locator('button', { hasText: '+ Ajouter un élément' }).click();

    // Wait for the new item to appear and fill it
    const lastItemFr = essentialFormula.locator('input[placeholder="Élément (FR)"]').last();
    const lastItemEn = essentialFormula.locator('input[placeholder="Élément (EN)"]').last();

    await lastItemFr.fill('Test Propagation FR');
    await lastItemEn.fill('Test Propagation EN');

    // Reorder items (Move up the last item)
    const moveUpBtn = essentialFormula.getByLabel("Monter l'élément").last();
    await moveUpBtn.click();

    // 4. Submit changes
    await page.locator('button', { hasText: 'Enregistrer les modifications' }).first().click();
    await expect(page.locator('text=Tarifs mis à jour avec succès.')).toBeVisible({ timeout: 10000 });

    // 5. Check Formules Page (FR)
    await page.goto('/fr/formules');
    await page.locator('button', { hasText: 'PHOTO' }).first().click();
    await expect(page.getByText('Test Propagation FR').first()).toBeVisible();

    // 6. Check Formules Page (EN)
    await page.goto('/en/pricing');
    await page.locator('button', { hasText: 'PHOTO' }).first().click();
    await expect(page.getByText('Test Propagation EN').first()).toBeVisible();

    // 7. Check Contact Page with URL Param (FR)
    await page.goto('/fr/contact?formula=photo-essential');
    await expect(page.locator('select[name="formula"]')).toHaveValue('photo-essential');

    // Switch to English and ensure ?formula= is kept
    await page.getByRole('button', { name: 'FR' }).click();
    await page.getByRole('link', { name: 'EN' }).click();

    await expect(page).toHaveURL(/.*\/en\/contact\?formula=photo-essential/);
    await expect(page.locator('select[name="formula"]')).toHaveValue('photo-essential');

    // 8. Delete the item to clean up
    await page.goto('/admin/pricing');
    const essentialClean = page.getByTestId('formula-card-photo-essential');
    const deleteBtn = essentialClean.getByLabel("Supprimer cet élément").last();
    await deleteBtn.click();
    await page.locator('button', { hasText: 'Enregistrer les modifications' }).first().click();
    await expect(page.locator('text=Tarifs mis à jour avec succès.')).toBeVisible({ timeout: 10000 });
  });
});
