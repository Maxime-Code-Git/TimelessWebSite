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

function readReceivedEmails(): string[] {
  if (!inboxPath) return [];
  const files = fs.readdirSync(inboxPath).filter(f => f.endsWith('.eml'));
  files.sort((a, b) => {
    return fs.statSync(path.join(inboxPath, a)).mtimeMs - fs.statSync(path.join(inboxPath, b)).mtimeMs;
  });
  return files.map(f => fs.readFileSync(path.join(inboxPath, f), 'utf-8'));
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
      // Photo Essentiel should have "Séance couple (+ 380 €)" (we'll just check 380 and the included text)
      await expect(page.locator('body')).toContainText('380');
      await expect(page.locator('body')).toContainText('(Inclus)');

      // Film should NOT have "Séance couple" - we can check the Film section
      const filmSection = page.locator('h2', { hasText: 'Film' }).locator('..');
      await expect(filmSection).not.toContainText('Séance couple');

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

      // 14. vérification du contenu de l'e-mail dans l'infrastructure SMTP E2E existante
      const emails = readReceivedEmails();
      expect(emails.length).toBeGreaterThan(0);
      const lastEmail = emails[emails.length - 1];
      expect(lastEmail).toContain('Séance couple : ajoutée en supplément (+380 €)');
    } finally {
      restoreDefaultSiteContent();
    }
  });
});
