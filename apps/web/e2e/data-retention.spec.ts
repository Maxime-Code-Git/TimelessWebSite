import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";

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

    } finally {
      // Unconditional cleanup via DB
      if (fs.existsSync(dbPath)) {
        const db = new DatabaseSync(dbPath);
        db.prepare("DELETE FROM bookings WHERE email = ?").run(testBookingEmail);
        db.close();
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

    let db: DatabaseSync | null = null;

    try {
      // 1. Create isolated gallery in DB
      db = new DatabaseSync(dbPath);
      db.prepare(
        `INSERT INTO galleries
         (id, public_id, bride_names, wedding_date, import_path, guest_code_hash, couple_code_hash, created_at, expires_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`
      ).run(galId, galId, galName, "2026-01-01", importSourceDir, "hash1", "hash2", Date.now(), Date.now() + 100000);

      // 2. Create managed media dir
      const mediaDir = path.join(mediaRoot, galId);
      fs.mkdirSync(mediaDir, { recursive: true });
      fs.writeFileSync(path.join(mediaDir, "test.jpg"), "fake image");

      // 3. Create separate import source dir
      fs.mkdirSync(importSourceDir, { recursive: true });
      fs.writeFileSync(path.join(importSourceDir, "source.jpg"), "source image");

      // Login
      await page.goto("/admin");
      await page.getByLabel("Mot de passe").fill(password);
      await page.getByRole("button", { name: "Se connecter" }).click();
      await expect(page.getByRole("heading", { name: "Administration Sempra" })).toBeVisible();

      // 4. Navigate to data retention and find gallery
      await page.goto("/admin/data-retention");
      await expect(page.getByRole("heading", { name: "Conservation et suppression des données" })).toBeVisible();

      await page.getByLabel("Rechercher des galeries").fill(galName);
      await page.getByRole("button", { name: "Rechercher", exact: true }).click();

      const row = page.getByRole("row").filter({ hasText: galName });
      await expect(row).toBeVisible();

      // 5. Confirm deletion
      await row.getByRole("button", { name: "Supprimer (Quarantaine)" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();

      const confirmInput = page.getByLabel("Veuillez taper SUPPRIMER pour confirmer :");
      await expect(confirmInput).toBeFocused();
      await confirmInput.fill("SUPPRIMER");

      // 6. Wait & verify HTTP response
      const deleteResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/admin/data-retention") && response.request().method() === "POST"
      );
      await page.getByRole("button", { name: "Confirmer la suppression" }).click();
      const deleteResponse = await deleteResponsePromise;
      expect(deleteResponse.status()).toBe(200);

      // 7. Verify gallery inaccessible
      await expect(page.getByRole("status")).toContainText("supprimée");
      await expect(page.getByRole("dialog")).not.toBeVisible();

      // Check in UI
      await page.getByLabel("Rechercher des galeries").fill(galName);
      await page.getByRole("button", { name: "Rechercher", exact: true }).click();
      await expect(page.getByText(galName)).not.toBeVisible();

      // 8. Verify media dir deleted or quarantined
      expect(fs.existsSync(mediaDir)).toBe(false);

      // 9. Verify import source dir intac
      expect(fs.existsSync(importSourceDir)).toBe(true);

    } finally {
      // 10. Cleanup exclusively own fixtures
      if (db) {
        // Fetch quarantine path before deletion
        const row = db.prepare("SELECT relative_quarantine_path FROM gallery_deletion_jobs WHERE gallery_id = ?").get(galId) as { relative_quarantine_path?: string } | undefined;
        if (row?.relative_quarantine_path) {
          const qDir = path.join(mediaRoot, row.relative_quarantine_path);
          if (fs.existsSync(qDir)) fs.rmSync(qDir, { recursive: true });
        }
        db.prepare("DELETE FROM gallery_deletion_jobs WHERE gallery_id = ?").run(galId);
        db.prepare("DELETE FROM galleries WHERE id = ?").run(galId);
        db.close();
      }
      const mediaDir = path.join(mediaRoot, galId);
      if (fs.existsSync(mediaDir)) fs.rmSync(mediaDir, { recursive: true });
      if (fs.existsSync(importSourceDir)) fs.rmSync(importSourceDir, { recursive: true });
    }
  });
});
