const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/e2e/client-gallery.spec.ts');
let content = fs.readFileSync(target, 'utf-8');

// 1. Remove if (heading > 0)
const oldLogin = `    const heading = await adminPage.locator("h2", { hasText: "Espace Administrateur" }).count();
    if (heading > 0) {
      await adminPage.fill('input[name="password"]', "e2e_password");
      await adminPage.click('button[type="submit"]');
      await adminPage.waitForURL("**/admin/galleries");
    }`;
const newLogin = `    await expect(adminPage.locator('input[name="password"]')).toBeVisible();
    await adminPage.fill('input[name="email"]', 'admin@example.com');
    await adminPage.fill('input[name="password"]', "e2e_password");
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForURL("**/admin/galleries");`;
content = content.replace(oldLogin, newLogin);

// 2. Fix import button
const oldImport = `    await adminPage.getByLabel("Dossier d'import").selectOption(IMPORT_FOLDER);
    await adminPage.click('button:has-text("Aperçu de l\\'import")');
    await expect(adminPage.locator("text=25 photo(s) invités")).toBeVisible();
    await adminPage.click('button:has-text("Lancer l\\'importation")');`;
const newImport = `    await adminPage.getByLabel("Dossier d'import").selectOption(IMPORT_FOLDER);
    await expect(adminPage.getByText("28 médias trouvés", { exact: false })).toBeVisible();
    adminPage.once("dialog", dialog => dialog.accept());
    await adminPage.getByRole("button", { name: "Confirmer et lancer l'import", exact: true }).click();`;
content = content.replace(oldImport, newImport);

// 3. Fix polling
const oldPolling = `    await expect(async () => {
      const res = await adminContext.request.get(\`/api/admin/gallery-import/\${galleryId}\`);
      expect(res.status()).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("completed");
      expect(data.progress).toBe(28);
      expect(data.total).toBe(28);
      expect(data.stats.maries_videos).toBe(1);
      expect(data.stats.invites_photos).toBe(25);
    }).toPass({ timeout: 15000, intervals: [500, 1000] });`;
const newPolling = `    await expect(async () => {
      const res = await adminContext.request.get(\`/api/admin/gallery-import/\${galleryId}\`);
      expect(res.status()).toBe(200);
      const data = await res.json();
      const importState = data.importState;

      expect(importState.status).toBe("completed");
      expect(importState.progress).toBe(28);
      expect(importState.total).toBe(28);

      const result = JSON.parse(importState.result_json);
      expect(result.imported).toBe(28);
      expect(result.ignored).toHaveLength(0);
    }).toPass({ timeout: 15000, intervals: [500, 1000] });`;
content = content.replace(oldPolling, newPolling);

fs.writeFileSync(target, content);
console.log("Fixed E2E spec final 3");
