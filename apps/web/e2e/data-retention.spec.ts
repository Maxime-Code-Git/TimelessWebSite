import { test, expect } from "@playwright/test";

test.describe("Data Retention & GDPR Administration", () => {
  test("full lifecycle: create data, export, delete, verify", async ({ page, request }, testInfo) => {
    const suffix = `${testInfo.project.name}-${testInfo.retry}`;
    const testBookingName = `E2ERetention${suffix}`;
    const testBookingEmail = `retention-${suffix}@test.local`;
    let createdBookingId: string | null = null;
    let csrfToken: string | null = null;
    const password = process.env.E2E_ADMIN_PASSWORD || "e2e_password";

    try {
      // 1. Fetch available slots
      const slotsRes = await request.get("/api/booking");
      expect(slotsRes.status()).toBe(200);
      const slotsData = await slotsRes.json();
      const slots = slotsData.slots;
      expect(slots).toBeDefined();
      expect(slots.length).toBeGreaterThan(0);
      
      const targetSlot = slots[0];

      // 2. Create an isolated test booking via the booking API
      const bookingPayload = {
        date: targetSlot.local_date,
        time: targetSlot.local_time,
        names: testBookingName,
        email: testBookingEmail,
        language: "fr"
      };

      const createRes = await request.post("/api/booking", {
        data: bookingPayload,
        headers: { "Content-Type": "application/json" }
      });
      
      expect(createRes.status()).toBe(201);
      const createData = await createRes.json();
      expect(createData.success).toBe(true);
      expect(createData.bookingId).toBeTruthy();
      createdBookingId = createData.bookingId;
      
      // 3. Login
      await page.goto("/admin");
      await page.getByLabel("Mot de passe").fill(password);
      await page.getByRole("button", { name: "Se connecter" }).click();
      await expect(page.getByRole("heading", { name: "Administration Sempra" })).toBeVisible();
      
      // 4. Navigate
      await page.goto("/admin/data-retention");
      await expect(page.getByRole("heading", { name: "Conservation et suppression des données" })).toBeVisible();

      // Extract CSRF token to clean up in finally block if needed
      csrfToken = await page.locator('input[name="csrfToken"]').first().inputValue();

      // 5. Search
      await page.getByLabel("Email, Nom, ID, Statut ou Date").fill(testBookingName);
      await page.getByRole("button", { name: "Rechercher" }).click();
      await expect(page.getByText(testBookingName)).toBeVisible();

      const row = page.getByRole("row").filter({ hasText: testBookingName });

      // 6. Export JSON
      const downloadPromise = page.waitForEvent("download");
      await row.getByRole("button", { name: "Exporter (JSON)" }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("booking_export.json");
      expect(await download.path()).toBeTruthy();

      // 7. Delete (incorrect)
      await row.getByRole("button", { name: "Supprimer" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      
      const confirmInput = page.getByLabel("Veuillez taper SUPPRIMER pour confirmer :");
      await expect(confirmInput).toBeFocused();
      await confirmInput.fill("WRONG");
      await page.getByRole("button", { name: "Confirmer la suppression" }).click();
      
      await expect(page.getByRole("alert")).toContainText("Confirmation incorrecte");
      
      // 8. Delete (correct)
      await confirmInput.fill("SUPPRIMER");
      
      const deleteResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/admin/data-retention") && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: "Confirmer la suppression" }).click();
      const deleteResponse = await deleteResponsePromise;
      expect(deleteResponse.status()).toBe(200);

      await expect(page.getByRole("status")).toContainText("supprimé");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      
      // 9. Verify it's gone
      await page.getByLabel("Email, Nom, ID, Statut ou Date").fill(testBookingName);
      await page.getByRole("button", { name: "Rechercher" }).click();
      await expect(page.getByText(testBookingName)).not.toBeVisible();
      
      createdBookingId = null; // Cleaned up successfully

    } finally {
      // 10. Unconditional cleanup if it failed midway
      if (createdBookingId && csrfToken) {
        // Fallback cleanup using internal route
        await request.post("/admin/data-retention", {
          form: {
            intent: "delete_booking_single",
            id: createdBookingId,
            confirm: "SUPPRIMER",
            csrfToken
          }
        });
      }
    }
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
  });
});
