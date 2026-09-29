import { test, expect } from "@playwright/test";

test.describe("Data Retention & GDPR Administration", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" }); // Assume logged in as admin

  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/data-retention");
    await expect(page.getByRole("heading", { name: "Conservation et suppression des données" })).toBeVisible();
  });

  test("can export a booking to JSON", async ({ page }) => {
    // We expect the first export button in the bookings table
    const bookingSection = page.getByRole("region", { name: /Recherche de rendez-vous/i });
    if (await bookingSection.isVisible()) {
      const exportBtn = page.getByRole("button", { name: /Exporter \(JSON\)/i }).first();
      
      const downloadPromise = page.waitForEvent("download");
      await exportBtn.click();
      const download = await downloadPromise;
      
      expect(download.suggestedFilename()).toMatch(/^booking_export_.*\.json$/);
    }
  });

  test("can permanently delete a single booking with confirmation", async ({ page }) => {
    const deleteBtn = page.getByRole("button", { name: /^Supprimer$/ }).first();
    await deleteBtn.click();

    page.getByRole("dialog", { name: /Suppression définitive/i });
    await expect(page.getByRole("dialog")).toBeVisible();

    const input = page.getByLabel("Veuillez taper SUPPRIMER pour confirmer :");
    await expect(input).toBeFocused();
    await input.fill("SUPPRIMER");

    const confirmBtn = page.getByRole("button", { name: "Confirmer la suppression" });
    await confirmBtn.click();

    const successMsg = page.getByRole("status");
    await expect(successMsg).toContainText("Rendez-vous supprimé définitivement.");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("can quarantine a gallery", async ({ page }) => {
    const quarantineBtn = page.getByRole("button", { name: /^Quarantaine$/ }).first();
    await quarantineBtn.click();

    page.getByRole("dialog", { name: /Suppression définitive/i });
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("quarantaine locale technique")).toBeVisible();

    const input = page.getByLabel("Veuillez taper SUPPRIMER pour confirmer :");
    await input.fill("SUPPRIMER");

    const confirmBtn = page.getByRole("button", { name: "Confirmer la suppression" });
    await confirmBtn.click();

    const successMsg = page.getByRole("status");
    await expect(successMsg).toContainText("Galerie placée en quarantaine");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("can cancel deletion modal and restore focus", async ({ page }) => {
    const deleteBtn = page.getByRole("button", { name: /^Supprimer$/ }).first();
    await deleteBtn.click();

    page.getByRole("dialog", { name: /Suppression définitive/i });
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    
    await expect(deleteBtn).toBeFocused();
  });

  test("cannot submit deletion with invalid confirmation", async ({ page }) => {
    const deleteBtn = page.getByRole("button", { name: /^Supprimer$/ }).first();
    await deleteBtn.click();

    page.getByRole("dialog", { name: /Suppression définitive/i });
    const input = page.getByLabel("Veuillez taper SUPPRIMER pour confirmer :");
    await input.fill("WRONG");

    const confirmBtn = page.getByRole("button", { name: "Confirmer la suppression" });
    await confirmBtn.click();

    // Native HTML validation will block if we used pattern, or our action returns an error
    // Here we assume action returns 400 with an error alert if submitted
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Confirmation incorrecte");
  });
});
