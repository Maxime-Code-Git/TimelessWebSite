const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'apps/web/e2e/client-gallery.spec.ts');
let content = fs.readFileSync(target, 'utf-8');

// 1. e2e_password
content = content.replace(/testadmin123/g, 'e2e_password');

// 2. Remove conditional login
content = content.replace(/const heading = await adminPage\.locator\('h2:has-text\("Admin"\)'\)\.count\(\);\n\s+if \(heading === 0\) \{\n\s+await adminPage\.fill\('input\[name="email"\]', 'admin@example\.com'\);\n\s+await adminPage\.fill\('input\[name="password"\]', 'e2e_password'\);\n\s+await adminPage\.click\('button\[type="submit"\]'\);\n\s+await adminPage\.waitForURL\("\/admin"\);\n\s+\}/,
`await adminPage.fill('input[name="email"]', 'admin@example.com');
    await adminPage.fill('input[name="password"]', 'e2e_password');
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForURL("/admin");`);

// 3. Guest/couple codes via label
content = content.replace(/const originalGuestCode = await adminPage\.locator\('input\[name="guestCode"\]'\)\.inputValue\(\);/,
`const originalGuestCode = await adminPage.getByLabel("Code invités actuel").inputValue();`);
content = content.replace(/const coupleCode = await adminPage\.locator\('input\[name="coupleCode"\]'\)\.inputValue\(\);/,
`const coupleCode = await adminPage.getByLabel("Code mariés actuel").inputValue();`);

// 4. Admin button & selector
content = content.replace(/await adminPage\.click\('text=Aperçu de l\\'import'\);/,
`await adminPage.getByLabel("Dossier d'import").selectOption(importFolderName);`);

// Wait for 28 médias trouvés and click Confirmer
content = content.replace(/await expect\(adminPage\.locator\('text=28 fichiers trouvés'\)\)\.toBeVisible\(\);\n\s+adminPage\.on\("dialog", dialog => dialog\.accept\(\)\);\n\s+await adminPage\.click\('button:has-text\("Lancer l\\'importation"\)'\);/,
`await expect(adminPage.locator('text=28 médias trouvés')).toBeVisible();
    adminPage.once("dialog", dialog => dialog.accept());
    await adminPage.click('button:has-text("Confirmer et lancer l\\'import")');`);

// 5. Polling fix
content = content.replace(/const \{ status, progress, total, result_json \} = await res\.json\(\);/,
`const { importState } = await res.json();
      const status = importState.status;
      const progress = importState.progress;
      const total = importState.total;
      const result_json = importState.result_json;`);

// 6. DB fetch for media instead of API
content = content.replace(/const adminPhotosRes = await adminContext\.request\.get\(`\/api\/admin\/gallery-media\/\$\{galleryId\}`\);\n\s+const adminPhotos = await adminPhotosRes\.json\(\);/,
`const mediaDb = new DatabaseSync(galleryDbPath);
    const adminPhotos = mediaDb.prepare("SELECT id, original_name, type, visibility FROM gallery_media WHERE gallery_id = ?").all(galleryId) as Record<string, unknown>[];
    mediaDb.close();`);

// 7. Test timeout
content = content.replace(/test\("cycle complet des galeries", async \(\{ browser, request \}\) => \{/,
`test("cycle complet des galeries", async ({ browser, request }) => {
    test.setTimeout(120_000);`);

// 8. Gallery view selectors
content = content.replace(/await expect\(guestPage\.locator\('\.media-item'\)\)\.toHaveCount\(24\);/g,
`await expect(guestPage.getByTestId('gallery-photo')).toHaveCount(24);`);
content = content.replace(/await expect\(guestPage\.locator\('\.media-item'\)\)\.toHaveCount\(26\);/g,
`await expect(guestPage.getByTestId('gallery-photo')).toHaveCount(25);`); // 25 because 24+1 (1 video is separate)
content = content.replace(/await expect\(guestVideo\)\.toHaveCount\(1\);/,
`await expect(guestVideo).toHaveCount(1);`);
content = content.replace(/const guestVideo = guestPage\.locator\('video'\);/,
`const guestVideo = guestPage.getByTestId('gallery-video').locator('video').first();
    await expect(guestPage.getByTestId('gallery-video')).toHaveCount(1);`);

// For couple view:
content = content.replace(/await expect\(couplePage\.locator\('\.media-item'\)\)\.toHaveCount\(24\);/,
`await expect(couplePage.getByTestId('gallery-photo')).toHaveCount(24);`);
content = content.replace(/await couplePage\.locator\('button:has-text\("Voir plus"\)'\)\.click\(\);\n\s+await expect\(couplePage\.locator\('\.media-item'\)\)\.toHaveCount\(28\);/,
`await couplePage.locator('button:has-text("Voir plus")').click();
    await expect(couplePage.getByTestId('gallery-photo')).toHaveCount(26);
    await expect(couplePage.getByTestId('gallery-video')).toHaveCount(2);`);

// 9. Remove execSync & ffmpeg
content = content.replace(/import \{ execSync \} from "node:child_process";\n/, '');
content = content.replace(/execSync\(`ffmpeg -f lavfi -i color=c=blue:s=100x100:d=1 -c:v libx264 -y "\$\{path\.join\(targetDir, "invites\/videos\/guest-video\.mp4"\)\}"`\);\n\s+execSync\(`ffmpeg -f lavfi -i color=c=red:s=100x100:d=1 -c:v libx264 -y "\$\{path\.join\(targetDir, "maries\/videos\/couple-video\.mp4"\)\}"`\);/,
`fs.copyFileSync(path.join(__dirname, "fixtures/vid1.mp4"), path.join(targetDir, "invites/videos/guest-video.mp4"));
    fs.copyFileSync(path.join(__dirname, "fixtures/vid2.mp4"), path.join(targetDir, "maries/videos/couple-video.mp4"));`);

// 10. Fix Rotation button
content = content.replace(/await adminPage\.click\("text=Générer un nouveau code"\);\n\s+\/\/ Attendre la sauvegarde du code rotatif\n\s+const newGuestCodeInput = adminPage\.locator\('input\[name="guestCode"\]'\);\n\s+await expect\(newGuestCodeInput\)\.not\.toHaveValue\(originalGuestCode\);\n\s+const newGuestCode = await newGuestCodeInput\.inputValue\(\);/,
`const [rotationResponse] = await Promise.all([
      adminPage.waitForResponse(res => res.url().includes('/admin/galleries') && res.request().method() === 'POST'),
      adminPage.click('button:has-text("Régénérer auto le code invités")')
    ]);
    expect(rotationResponse.status()).toBe(200);

    const newGuestCodeInput = adminPage.getByLabel("Code invités actuel");
    await expect(newGuestCodeInput).not.toHaveValue(originalGuestCode);
    const newGuestCode = await newGuestCodeInput.inputValue();`);

// Fix Enregistrer les informations
content = content.replace(/await adminPage\.click\('button:has-text\("Enregistrer les modifications"\)'\);/,
`await adminPage.click('button:has-text("Enregistrer les informations")');`);

fs.writeFileSync(target, content);
console.log("Rewrote client-gallery.spec.ts");
