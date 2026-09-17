import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';

const inboxPath = process.env.E2E_SMTP_INBOX_PATH as string;
const modePath = process.env.E2E_SMTP_MODE_PATH as string;

if (!inboxPath || !modePath) {
  throw new Error("E2E_SMTP_INBOX_PATH and E2E_SMTP_MODE_PATH must be defined");
}

function clearInbox() {
  const files = fs.readdirSync(inboxPath);
  for (const file of files) {
    if (file.endsWith('.eml')) {
      fs.unlinkSync(path.join(inboxPath, file));
    }
  }
}

function setSmtpMode(mode: 'accept' | 'reject') {
  fs.writeFileSync(modePath, mode);
}

function readReceivedEmails(): string[] {
  const files = fs.readdirSync(inboxPath).filter(f => f.endsWith('.eml'));
  // Sort by modification time to ensure deterministic order
  files.sort((a, b) => {
    const statA = fs.statSync(path.join(inboxPath, a));
    const statB = fs.statSync(path.join(inboxPath, b));
    return statA.mtimeMs - statB.mtimeMs;
  });
  return files.map(f => fs.readFileSync(path.join(inboxPath, f), 'utf-8'));
}

test.beforeEach(() => {
  clearInbox();
  setSmtpMode('accept');

  // Wipe rate-limit db
  try {
    if (process.env.RATE_LIMIT_DB_PATH) {
      const db = new DatabaseSync(process.env.RATE_LIMIT_DB_PATH);
      db.exec('DELETE FROM requests');
      db.close();
    }
  } catch {
    // Ignore if db doesn't exist yet
  }
});

test.afterEach(() => {
  setSmtpMode('accept');
});

test.describe.configure({ mode: 'serial' });

test.describe('Contact Form (Phase 3 Backend)', () => {
  test('should successfully submit form, clear it, and allow a second submission (FR)', async ({ page }) => {
    await page.goto('/fr/contact');

    const randomIp = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp });

    // First submission
    await page.fill('#names', 'John First');
    await page.fill('#email', 'first@example.com');
    await page.fill('#date', '2027-08-15');
    await page.fill('#location', 'Bruxelles');
    await page.selectOption('#formula', 'photo-signature');
    await page.fill('#message', 'Un message de test.');
    await page.click('button[type="submit"]');

    // Check if there is an error displayed
    page.locator('[role="alert"]').last();

    // Expect success message and form cleared
    await expect(page.getByRole('status')).toContainText('Votre message a bien été envoyé');
    await expect(page.locator('#names')).toBeEmpty();

    await expect.poll(() => readReceivedEmails().length).toBe(1);

    // Second submission
    await page.fill('#names', 'Jane Second');
    await page.fill('#email', 'second@example.com');
    await page.fill('#date', '2027-09-20');
    await page.fill('#location', 'Paris');
    await page.selectOption('#formula', 'film-signature');
    await page.fill('#message', 'Un deuxième message.');
    await page.click('button[type="submit"]');

    // Expect success message and form cleared again
    await expect(page.getByRole('status')).toContainText('Votre message a bien été envoyé');
    await expect(page.locator('#names')).toBeEmpty();

    await expect.poll(() => readReceivedEmails().length).toBe(2);

    const emails = readReceivedEmails();
    expect(emails[1]).toContain('Jane Second');
  });

  test('should keep values, show error on SMTP failure, and focus error (EN)', async ({ page }) => {
    setSmtpMode('reject');

    const randomIp = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp });

    await page.goto('/en/contact');

    await page.fill('#names', 'Jane Error');
    await page.fill('#email', 'jane@example.com');
    await page.fill('#date', '2027-08-15');
    await page.fill('#location', 'London');
    await page.selectOption('#formula', 'film-signature');
    await page.fill('#message', 'Error test.');

    await page.click('button[type="submit"]');

    // Expect error message (generic EN)
    const errorAlert = page.locator('[role="alert"]').filter({ hasText: 'An error occurred' });
    await expect(errorAlert).toBeVisible();

    // Check focus on error
    await expect(errorAlert).toBeFocused();

    // Expect values to be kept
    await expect(page.locator('#names')).toHaveValue('Jane Error');
    await expect(page.locator('#email')).toHaveValue('jane@example.com');

    // Expect no email sent
    expect(readReceivedEmails().length).toBe(0);
  });
});
