import { test, expect } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { executeWithSqliteRetry } from "./test-helpers";

interface BookingSlot {
  date: string;
  time: string;
  slot_key: string;
}

test.describe("Data Retention & GDPR Administration", () => {
  test("full lifecycle: create data, export, delete, verify", async ({ page, request }, testInfo) => {
    const password = process.env.E2E_ADMIN_PASSWORD;
    if (!password) throw new Error("E2E_ADMIN_PASSWORD is required");
    const dbPath = process.env.BOOKING_DB_PATH;
    if (!dbPath) throw new Error("BOOKING_DB_PATH is required");

    const projectName = testInfo.project.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const uniqueId = crypto.randomUUID().split("-")[0];
    const suffix = `${projectName}-${testInfo.retry}-${uniqueId}`;
    const testBookingName = `E2ERetention${suffix}`;
    const testBookingEmail = `retention-${suffix}@test.local`;

    try {
      // 1. Fetch available slots
      const slotsRes = await request.get("/api/booking");
      expect(slotsRes.status()).toBe(200);
      const slotsData = await slotsRes.json() as { slots: BookingSlot[] };
      const slots = slotsData.slots;
      expect(slots).toBeDefined();
      expect(slots.length).toBeGreaterThan(0);

      const targetSlot = slots[0];

      expect(typeof targetSlot.date).toBe("string");
      expect(targetSlot.date.length).toBeGreaterThan(0);
      expect(typeof targetSlot.time).toBe("string");
      expect(targetSlot.time.length).toBeGreaterThan(0);

      // 2. Create an isolated test booking via the booking API
      const bookingPayload = {
        date: targetSlot.date,
        time: targetSlot.time,
        names: testBookingName,
        email: testBookingEmail,
        language: "fr"
      };

      const originUrl = testInfo.project.use.baseURL;
      if (!originUrl) throw new Error("baseURL is required");

      const createRes = await request.post("/api/booking", {
        data: bookingPayload,
        headers: {
          "Content-Type": "application/json",
          "Origin": originUrl
        }
      });

      expect(createRes.status()).toBe(201);
      const createData = await createRes.json();
      expect(createData.success).toBe(true);

      // 3. Login
      await page.goto("/admin");
      await page.getByLabel("Mot de passe").fill(password);
      await page.getByRole("button", { name: "Se connecter" }).click();
      await expect(page.getByRole("heading", { name: "Administration Sempra" })).toBeVisible();

      // 4. Navigate
      await page.goto("/admin/data-retention");
      await expect(page.getByRole("heading", { name: "Conservation et suppression des données" })).toBeVisible();

      // 5. Search
      const bookingSearchForm = page.getByRole("form", { name: "Recherche de rendez-vous" });
      await bookingSearchForm.getByLabel("Email, Nom, ID, Statut ou Date").fill(testBookingName);
      await bookingSearchForm.getByRole("button", { name: "Rechercher", exact: true }).click();
      await expect(page.getByText(testBookingName)).toBeVisible();

      const row = page.getByRole("row").filter({ hasText: testBookingName });

      // 6. Export JSON
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        row.getByRole("button", { name: "Exporter (JSON)" }).click()
      ]);
      expect(download.suggestedFilename()).toBe("booking_export.json");
      const downloadPath = await download.path();
      expect(downloadPath).toBeTruthy();
      const downloadContent = JSON.parse(fs.readFileSync(downloadPath!, "utf-8"));
      expect(downloadContent.id).toBeDefined();
      expect(downloadContent.email).toBe(testBookingEmail);
      expect(downloadContent.slot_key).toBeUndefined();

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

      // 9. Verify it's gone - wait for search request to finish deterministically
      const bookingSearchForm2 = page.getByRole("form", { name: "Recherche de rendez-vous" });
      await bookingSearchForm2.getByLabel("Email, Nom, ID, Statut ou Date").fill(testBookingName);

      const searchResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/admin/data-retention") && response.request().method() === "GET"
      );
      await bookingSearchForm2.getByRole("button", { name: "Rechercher", exact: true }).click();
      const searchResponse = await searchResponsePromise;
      expect(searchResponse.status()).toBe(200);

      await expect(page.getByText(testBookingName)).not.toBeVisible();
      await expect(page.getByText("Aucun rendez-vous trouvé.")).toBeVisible();

    } finally {
      // Unconditional cleanup via DB with bounded retry & busy timeout
      if (fs.existsSync(dbPath)) {
        await executeWithSqliteRetry(dbPath, (db) => {
          db.prepare("DELETE FROM bookings WHERE email = ?").run(testBookingEmail);
        });
      }
    }
  });

  test("gallery deletion with quarantine", async ({ page }) => {
    const password = process.env.E2E_ADMIN_PASSWORD;
    if (!password) throw new Error("E2E_ADMIN_PASSWORD is required");

    const uniqueId = crypto.randomUUID().split("-")[0];
    const galId = `e2e-gal-${uniqueId}`;
    const galName = `E2E Gallery ${uniqueId}`;

    const dbPath = process.env.GALLERY_DB_PATH;
    if (!dbPath) throw new Error("GALLERY_DB_PATH is required");
    const mediaRoot = process.env.GALLERY_MEDIA_PATH;
    if (!mediaRoot) throw new Error("GALLERY_MEDIA_PATH is required");
    const importBase = process.env.GALLERY_IMPORT_PATH;
    if (!importBase) throw new Error("GALLERY_IMPORT_PATH is required");
    const importSourceDir = path.join(importBase, `e2e-source-${uniqueId}`);

    try {
      // 1. Create isolated gallery in DB with bounded retry
      await executeWithSqliteRetry(dbPath, (db) => {
        db.prepare(
          `INSERT INTO galleries
           (id, public_id, bride_names, wedding_date, import_path, guest_code_hash, couple_code_hash, guest_code_encrypted, couple_code_encrypted, guest_code_version, couple_code_version, created_at, expires_at, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`
        ).run(galId, galId, galName, "2026-01-01", importSourceDir, "hash1", "hash2", "enc1", "enc2", 1, 1, Date.now(), Date.now() + 100000);
      });

      // 2. Create managed media dir
      const mediaDir = path.join(mediaRoot, galId);
      fs.mkdirSync(mediaDir, { recursive: true });
      fs.writeFileSync(path.join(mediaDir, "test.jpg"), "fake image");

      // 3. Create separate import source dir
      fs.mkdirSync(importSourceDir, { recursive: true });
      fs.writeFileSync(path.join(importSourceDir, "source.jpg"), "source image");

      // 4. Login
      await page.goto("/admin");
      await page.getByLabel("Mot de passe").fill(password);
      await page.getByRole("button", { name: "Se connecter" }).click();
      await expect(page.getByRole("heading", { name: "Administration Sempra" })).toBeVisible();

      // 5. Navigate to data retention and find gallery
      await page.goto("/admin/data-retention");
      await expect(page.getByRole("heading", { name: "Conservation et suppression des données" })).toBeVisible();

      const gallerySearchForm = page.getByRole("form", { name: "Recherche de galeries" });
      await gallerySearchForm.getByLabel("Rechercher des galeries").fill(galName);
      await gallerySearchForm.getByRole("button", { name: "Rechercher", exact: true }).click();

      const row = page.getByRole("row").filter({ hasText: galName });
      await expect(row).toBeVisible();

      // 6. Confirm deletion
      await row.getByRole("button", { name: "Supprimer (Quarantaine)" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();

      const confirmInput = page.getByLabel("Veuillez taper SUPPRIMER pour confirmer :");
      await expect(confirmInput).toBeFocused();
      await confirmInput.fill("SUPPRIMER");

      // 7. Wait & verify HTTP response
      const deleteResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/admin/data-retention") && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: "Confirmer la suppression" }).click();
      const deleteResponse = await deleteResponsePromise;
      expect(deleteResponse.status()).toBe(200);

      // 8. Verify gallery inaccessible
      await expect(page.getByRole("status")).toContainText("supprimée");
      await expect(page.getByRole("dialog")).not.toBeVisible();

      // Check in UI - wait for search request deterministically
      const gallerySearchForm2 = page.getByRole("form", { name: "Recherche de galeries" });
      await gallerySearchForm2.getByLabel("Rechercher des galeries").fill(galName);
      const gallerySearchResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/admin/data-retention") && response.request().method() === "GET"
      );
      await gallerySearchForm2.getByRole("button", { name: "Rechercher", exact: true }).click();
      const gallerySearchResponse = await gallerySearchResponsePromise;
      expect(gallerySearchResponse.status()).toBe(200);
      await expect(page.getByText(galName)).not.toBeVisible();

      // 9. Verify media dir deleted or quarantined
      expect(fs.existsSync(mediaDir)).toBe(false);

      // 10. Verify import source dir intact
      expect(fs.existsSync(importSourceDir)).toBe(true);

    } finally {
      // 11. Cleanup exclusively own fixtures with bounded retry
      if (fs.existsSync(dbPath)) {
        await executeWithSqliteRetry(dbPath, (db) => {
          // Fetch quarantine path before deletion
          const row = db.prepare("SELECT relative_quarantine_path FROM gallery_deletion_jobs WHERE gallery_id = ?").get(galId) as { relative_quarantine_path?: string } | undefined;
          if (row?.relative_quarantine_path) {
            const qDir = path.join(mediaRoot, row.relative_quarantine_path);
            if (fs.existsSync(qDir)) {
              try { fs.rmSync(qDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
          db.prepare("DELETE FROM gallery_deletion_jobs WHERE gallery_id = ?").run(galId);
          db.prepare("DELETE FROM galleries WHERE id = ?").run(galId);
        });
      }
      const mediaDir = path.join(mediaRoot, galId);
      if (fs.existsSync(mediaDir)) {
        try { fs.rmSync(mediaDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
      if (fs.existsSync(importSourceDir)) {
        try { fs.rmSync(importSourceDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }
  });
});
