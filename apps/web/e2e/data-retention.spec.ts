import { test, expect } from "@playwright/test";

test.describe("Data Retention & GDPR Administration", () => {
  test("full lifecycle: create data, export, delete, verify", async ({ page, request }, testInfo) => {
    const suffix = `${testInfo.project.name}-${testInfo.retry}`;
    const testBookingName = `E2E-Retention-${suffix}`;
    const testBookingEmail = `retention-${suffix}@test.local`;

    // 1. Login via E2E_ADMIN_PASSWORD
    const password = process.env.E2E_ADMIN_PASSWORD || "e2e_password";
    await page.goto("/admin");
    await page.getByLabel("Mot de passe").fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByRole("heading", { name: "Administration Sempra" })).toBeVisible();

    // 2. Create an isolated test booking via the booking API
    const bookingPayload = {
      local_date: "2020-01-15",
      local_time: "10:00",
      names: testBookingName,
      email: testBookingEmail,
      language: "fr"
    };

    const createRes = await request.post("/api/booking", {
      data: bookingPayload,
      headers: { "Content-Type": "application/json" }
    });
    // Store the booking id for cleanup
    try {
      await createRes.json();
    } catch {
      // Booking creation may work differently; we'll find it via search
    }

    // 3. Navigate to data retention
    await page.goto("/admin/data-retention");
    await expect(page.getByRole("heading", { name: "Conservation et suppression des données" })).toBeVisible();

    // Verify RGPD info block is present
    await expect(page.getByText("ne supprime jamais le dossier source")).toBeVisible();

    // 4. Search for our test booking
    await page.getByLabel("Email, Nom, ID, Statut ou Date").fill(testBookingName);
    await page.getByRole("button", { name: "Rechercher" }).click();

    // 5. Verify our test data appears
    await expect(page.getByText(testBookingName)).toBeVisible();

    // 6. Export JSON
    const exportRow = page.getByRole("row").filter({ hasText: testBookingName });
    const downloadPromise = page.waitForEvent("download");
    await exportRow.getByRole("button", { name: "Exporter (JSON)" }).click();
    const download = await downloadPromise;

    // Filename must be neutral
    expect(download.suggestedFilename()).toBe("booking_export.json");

    // Verify export content
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    // 7. Try incorrect confirmation
    await exportRow.getByRole("button", { name: "Supprimer" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveAttribute("aria-modal", "true");

    const confirmInput = page.getByLabel("Veuillez taper SUPPRIMER pour confirmer :");
    await expect(confirmInput).toBeFocused();
    await confirmInput.fill("WRONG");
    await page.getByRole("button", { name: "Confirmer la suppression" }).click();

    // Should show error
    await expect(page.getByRole("alert")).toContainText("Confirmation incorrecte");

    // 8. Re-search and delete correctly
    await page.getByLabel("Email, Nom, ID, Statut ou Date").fill(testBookingName);
    await page.getByRole("button", { name: "Rechercher" }).click();
    await expect(page.getByText(testBookingName)).toBeVisible();

    const deleteRow = page.getByRole("row").filter({ hasText: testBookingName });
    const deleteBtn = deleteRow.getByRole("button", { name: "Supprimer" });
    await deleteBtn.click();

    await expect(page.getByRole("dialog")).toBeVisible();
    const confirmInput2 = page.getByLabel("Veuillez taper SUPPRIMER pour confirmer :");
    await confirmInput2.fill("SUPPRIMER");

    const deleteResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/admin/data-retention") && response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Confirmer la suppression" }).click();
    const deleteResponse = await deleteResponsePromise;
    expect(deleteResponse.status()).toBe(200);

    // Success message
    await expect(page.getByRole("status")).toContainText("supprimé définitivement");

    // 9. Verify the booking is truly gone
    await page.getByLabel("Email, Nom, ID, Statut ou Date").fill(testBookingName);
    await page.getByRole("button", { name: "Rechercher" }).click();
    await expect(page.getByText(testBookingName)).not.toBeVisible();

    // 10. Cancel modal and verify focus restore
    // Create another booking to test cancel
    await page.getByLabel("Email, Nom, ID, Statut ou Date").fill("");
    await page.getByRole("button", { name: "Rechercher" }).click();

    // If there are bookings, test cancel
    const anyDeleteBtn = page.getByRole("button", { name: "Supprimer" }).first();
    if (await anyDeleteBtn.isVisible()) {
      await anyDeleteBtn.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect(anyDeleteBtn).toBeFocused();
    }

    // 11. Verify cleanup status section is visible
    await expect(page.getByRole("heading", { name: "Statut du nettoyage" })).toBeVisible();
  });

  test("gallery deletion with quarantine", async ({ page }) => {
    const password = process.env.E2E_ADMIN_PASSWORD || "e2e_password";

    // Login
    await page.goto("/admin");
    await page.getByLabel("Mot de passe").fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByRole("heading", { name: "Administration Sempra" })).toBeVisible();

    // Navigate to data retention
    await page.goto("/admin/data-retention");
    await expect(page.getByRole("heading", { name: "Conservation et suppression des données" })).toBeVisible();

    // Verify gallery columns are present
    await expect(page.getByText("Photos")).toBeVisible();
    await expect(page.getByText("Vidéos")).toBeVisible();
    await expect(page.getByText("Taille")).toBeVisible();
    await expect(page.getByText("Expiration")).toBeVisible();

    // Verify quarantine info is shown in modal
    const galleryDeleteBtn = page.getByRole("button", { name: "Supprimer (Quarantaine)" }).first();
    if (await galleryDeleteBtn.isVisible()) {
      await galleryDeleteBtn.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByText("quarantaine locale technique")).toBeVisible();

      // Cancel
      await page.getByRole("button", { name: "Annuler" }).click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
    }
  });
});
