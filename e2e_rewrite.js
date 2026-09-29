const fs = require('fs');
const content = `import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";

test.describe("Data Retention & GDPR Administration", () => {
  test("full lifecycle: create data, export, delete, verify", async ({ page, request }, testInfo) => {
    const password = process.env.E2E_ADMIN_PASSWORD;
    if (!password) throw new Error("E2E_ADMIN_PASSWORD is required");

    const projectName = testInfo.project.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const uniqueId = crypto.randomUUID().split("-")[0];
    const suffix = \`\${projectName}-\${testInfo.retry}-\${uniqueId}\`;
    const testBookingName = \`E2ERetention\${suffix}\`;
    const testBookingEmail = \`retention-\${suffix}@test.local\`;

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
        headers: { 
          "Content-Type": "application/json",
          "Origin": "http://127.0.0.1:3000"
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
      const dbPath = process.env.DB_BOOKING_PATH || path.join(process.cwd(), "data", "booking.db");
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
    const galId = \`e2e-gal-\${uniqueId}\`;
    const galName = \`E2E Gallery \${uniqueId}\`;
    
    const dbPath = process.env.DB_GALLERY_PATH || path.join(process.cwd(), "data", "gallery.db");
    const mediaRoot = process.env.GALLERIES_DIR || path.join(process.cwd(), "public", "galleries");
    const quarantineRoot = process.env.GALLERIES_TRASH_DIR || path.join(process.cwd(), ".trash", "galleries");
    const importSourceDir = path.join(process.cwd(), "tmp", \`e2e-source-\${uniqueId}\`);
    
    let db: DatabaseSync | null = null;
    
    try {
      // 1. Create isolated gallery in DB
      if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      db = new DatabaseSync(dbPath);
      // Make sure table exists
      db.exec(\`CREATE TABLE IF NOT EXISTS galleries (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        description TEXT,
        status TEXT NOT NULL,
        created_at_utc TEXT NOT NULL
      )\`);
      db.prepare(
        "INSERT INTO galleries (id, name, slug, status, created_at_utc) VALUES (?, ?, ?, 'published', datetime('now'))"
      ).run(galId, galName, galId);
      
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
      
      await page.getByLabel("Rechercher dans les galeries (ID ou Nom)").fill(galName);
      await page.getByRole("button", { name: "Rechercher", exact: true }).click();
      
      const row = page.getByRole("row").filter({ hasText: galName });
      await expect(row).toBeVisible();

      // 5. Confirm deletion
      await row.getByRole("button", { name: "Supprimer" }).click();
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
      await page.getByLabel("Rechercher dans les galeries (ID ou Nom)").fill(galName);
      await page.getByRole("button", { name: "Rechercher", exact: true }).click();
      await expect(page.getByText(galName)).not.toBeVisible();
      
      // 8. Verify media dir deleted or quarantined
      expect(fs.existsSync(mediaDir)).toBe(false);
      // Wait a moment for async file moves in background if any (though DB renameSync is sync)
      
      // 9. Verify import source dir intact
      expect(fs.existsSync(importSourceDir)).toBe(true);

    } finally {
      // 10. Cleanup exclusively own fixtures
      if (db) {
        try {
          db.prepare("DELETE FROM galleries WHERE id = ?").run(galId);
        } catch { /* ignore */ }
        db.close();
      }
      const mediaDir = path.join(mediaRoot, galId);
      const quarantineDir = path.join(quarantineRoot, galId);
      fs.rmSync(mediaDir, { recursive: true, force: true });
      fs.rmSync(quarantineDir, { recursive: true, force: true });
      fs.rmSync(importSourceDir, { recursive: true, force: true });
    }
  });
});
`;
fs.writeFileSync('apps/web/e2e/data-retention.spec.ts', content);
