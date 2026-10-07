import { test, expect } from '@playwright/test';
import { restoreDefaultSiteContent } from './test-helpers';
import * as fs from 'node:fs';
import * as path from 'node:path';

const inboxPath = process.env.E2E_SMTP_INBOX_PATH as string;

function clearInbox() {
  if (!inboxPath) return;
  const files = fs.readdirSync(inboxPath);
  for (const file of files) {
    if (file.endsWith('.eml')) {
      fs.unlinkSync(path.join(inboxPath, file));
    }
  }
}

function decodeQuotedPrintableBody(eml: string): string {
  const match = eml.match(/^(.*?)(?:\r\n\r\n|\n\n)(.*)$/s);
  if (!match) return eml;

  const headers = match[1];
  let body = match[2];

  if (!/content-transfer-encoding:\s*quoted-printable/i.test(headers)) {
    return body;
  }

  body = body.replace(/=\r\n/g, '');
  body = body.replace(/=\n/g, '');

  const bytes: number[] = [];
  let i = 0;
  while (i < body.length) {
    if (body[i] === '=' && i + 2 < body.length) {
      const hex = body.substring(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 3;
        continue;
      }
    }
    bytes.push(body.charCodeAt(i));
    i++;
  }

  return Buffer.from(bytes).toString('utf8');
}

test.describe.configure({ mode: 'serial' });

test.describe('Couple Session Addon Flow', () => {
  test.beforeAll(async () => {
    restoreDefaultSiteContent();
  });

  test.beforeEach(() => {
    clearInbox();
  });

  test.afterAll(async () => {
    restoreDefaultSiteContent();
  });

  test('completes full couple session addon flow', async ({ page }) => {
    try {
      restoreDefaultSiteContent();
      // 1. authentification administrateur réelle via la variable E2E existante
      await page.goto("/admin");
      await page.locator('input[name="password"]').fill("e2e_password");
      await page.locator('button[type="submit"]').click();
      await expect(page.locator("h1")).toContainText("Administration Sempra");

      // 2. ouverture de /admin/pricing
      await page.goto("/admin/pricing");

      // 3. modification du prix de la séance couple
      await page.fill('#addon-price-0', '380');

      // 4. sauvegarde avec attente de la réponse HTTP
      const savePromise = page.waitForResponse(r => r.url().includes('/admin/pricing') && r.status() === 200);
      await page.click('button[type="submit"]');
      await savePromise;

      // 5. rechargement et vérification de la persistance
      await page.reload();
      await expect(page.locator('#addon-price-0')).toHaveValue('380.00');

      // 6 & 7 & 8: Check public UI
      await page.goto('/fr/formules');

      // Photo category
      await page.getByRole('button', { name: 'Photographie', exact: true }).click();
      const photoEssentialCard = page.getByTestId('pricing-card-photo-essential');
      await expect(photoEssentialCard).toContainText('Séance couple disponible en option');
      await expect(photoEssentialCard).toContainText('380');

      const photoPrestigeCard = page.getByTestId('pricing-card-photo-prestige');
      await expect(photoPrestigeCard).toContainText('Séance couple incluse');

      // Film category
      await page.getByRole('button', { name: 'Film', exact: true }).click();
      await expect(page.getByTestId('pricing-card-film-essential')).toBeVisible(); // wait for rendering
      // Ensure no film addon exists for couple session
      await expect(page.locator('[data-testid^="pricing-addon-film-"]')).toHaveCount(0);
      // Ensure no text mentions "Séance couple" in the whole film tab
      const filmCards = page.locator('[data-testid^="pricing-card-film-"]');
      for (const card of await filmCards.all()) {
        await expect(card).not.toContainText('Séance couple');
      }

      // Duo category
      await page.getByRole('button', { name: 'Photo & Film', exact: true }).click();
      const duoEssentialCard = page.getByTestId('pricing-card-duo-essential');
      await expect(duoEssentialCard).toContainText('Séance couple disponible en option');
      await expect(duoEssentialCard).toContainText('380');

      const duoPrestigeCard = page.getByTestId('pricing-card-duo-prestige');
      await expect(duoPrestigeCard).toContainText('Séance couple incluse');

      // 9. ouverture du contact avec ?formula=photo-essential
      await page.goto('/fr/contact?formula=photo-essential');

      // 10. affichage et sélection de la case
      const addonCheckbox = page.locator('input[name="addons"][value="couple-session"]');
      await expect(addonCheckbox).toBeVisible();
      await addonCheckbox.check();

      // 11. changement vers Film et vérification que la case disparaît
      await page.selectOption('select[name="formula"]', 'film-essential');
      await expect(addonCheckbox).not.toBeVisible();

      // 12. retour vers Photo Essentiel et sélection de l'option
      await page.selectOption('select[name="formula"]', 'photo-essential');
      await addonCheckbox.check();

      // Relever la liste des fichiers .eml présents avant l’envoi du formulaire
      const initialFiles = new Set(fs.readdirSync(inboxPath).filter(f => f.endsWith('.eml')));

      // 13. soumission du formulaire
      await page.fill('#names', 'Test E2E');
      await page.fill('#email', 'test@example.com');
      await page.fill('#phone', '0102030405');
      await page.fill('#date', '2028-05-15');
      await page.fill('#location', 'Paris');
      await page.fill('#message', 'Hello addon E2E');

      const submitPromise = page.waitForResponse(r => r.url().includes('/contact') && r.status() === 200);
      await page.click('button[type="submit"]');
      await submitPromise;

      await expect(page.locator('[role="status"]')).toBeVisible();

      // 14. vérification du contenu de l'e-mail dans l'infrastructure SMTP E2E
      let latestFile = "";
      await expect.poll(() => {
        const currentFiles = fs.readdirSync(inboxPath).filter(f => f.endsWith('.eml'));
        const newFiles = currentFiles.filter(f => !initialFiles.has(f));
        if (newFiles.length > 0) {
          newFiles.sort((a, b) => {
            return fs.statSync(path.join(inboxPath, b)).mtimeMs - fs.statSync(path.join(inboxPath, a)).mtimeMs;
          });
          latestFile = newFiles[0];
        }
        return newFiles.length;
      }, { timeout: 10000 }).toBeGreaterThan(0);

      const rawContent = fs.readFileSync(path.join(inboxPath, latestFile), 'utf-8');
      const decodedBody = decodeQuotedPrintableBody(rawContent);
      expect(decodedBody).toContain('Séance couple : ajoutée en supplément (+380\u00A0€)');
    } finally {
      restoreDefaultSiteContent();
    }
  });
});
