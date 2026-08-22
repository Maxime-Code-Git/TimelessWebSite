import { test, expect } from '@playwright/test';
import { SMTPServer } from 'smtp-server';
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';

let smtpServer: SMTPServer;
let receivedEmails: { session: unknown; buffer: string }[] = [];
let smtpReject = false;
let smtpTimeout = false;

// eslint-disable-next-line no-empty-pattern
test.beforeAll(async ({}, workerInfo) => {
  if (workerInfo.project.name !== 'chromium') return;

  smtpServer = new SMTPServer({
    secure: false,
    key: fs.readFileSync('./e2e/certs/test-key.pem'),
    cert: fs.readFileSync('./e2e/certs/test-cert.pem'),
    authOptional: true, // Allow auth without checking password strictly for tests
    onAuth(auth, session, callback) {
      // Accept any auth credentials for tests
      return callback(null, { user: auth.username });
    },
    onData(stream, session, callback) {
      if (smtpTimeout) {
        // intentionally hang
        return;
      }
      if (smtpReject) {
        return callback(new Error("Intentional SMTP rejection"));
      }
      let buffer = '';
      stream.on('data', (chunk) => (buffer += chunk));
      stream.on('end', () => {
        receivedEmails.push({ session, buffer });
        callback();
      });
    },
    onRcptTo(address, session, callback) {
      if (smtpReject) {
        return callback(new Error("Intentional recipient rejection"));
      }
      callback();
    },
  });

  await new Promise<void>((resolve) => {
    smtpServer.listen(2525, () => resolve());
  });
});

// eslint-disable-next-line no-empty-pattern
test.afterAll(async ({}, workerInfo) => {
  if (workerInfo.project.name !== 'chromium') return;
  smtpServer?.close();
});

test.beforeEach(() => {
  receivedEmails = [];
  smtpReject = false;
  smtpTimeout = false;

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

test.describe.configure({ mode: 'serial' });

test.describe('Contact Form (Phase 3 Backend)', () => {
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile, 'SMTP server can only run in one project to avoid port conflicts');
  test('should successfully submit form, clear it, and allow a second submission (FR)', async ({ page }) => {
    await page.goto('/fr/contact');

    const randomIp = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp });

    // First submission
    await page.fill('#names', 'John First');
    await page.fill('#email', 'first@example.com');
    await page.fill('#date', '2027-08-15');
    await page.fill('#location', 'Bruxelles');
    await page.selectOption('#formula', 'photo');
    await page.fill('#message', 'Un message de test.');
    await page.click('button[type="submit"]');

    // Check if there is an error displayed
    const errorAlert = page.locator('[role="alert"]').last();
    if (await errorAlert.isVisible()) {
      console.error("Test failed because of form error:", await errorAlert.textContent());
    }

    // Expect success message and form cleared
    await expect(page.getByRole('status')).toContainText('Votre message a bien été envoyé');
    await expect(page.locator('#names')).toBeEmpty();
    expect(receivedEmails.length).toBe(1);

    // Second submission
    await page.fill('#names', 'Jane Second');
    await page.fill('#email', 'second@example.com');
    await page.fill('#date', '2027-09-20');
    await page.fill('#location', 'Paris');
    await page.selectOption('#formula', 'film');
    await page.fill('#message', 'Un deuxième message.');
    await page.click('button[type="submit"]');

    // Expect success message and form cleared again
    await expect(page.getByRole('status')).toContainText('Votre message a bien été envoyé');
    await expect(page.locator('#names')).toBeEmpty();
    expect(receivedEmails.length).toBe(2);
    expect(receivedEmails[1].buffer).toContain('Jane Second');
  });

  test('should keep values, show error on SMTP failure, and focus error (EN)', async ({ page }) => {
    smtpReject = true; // Mock rejection
    const randomIp = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp });

    await page.goto('/en/contact');

    await page.fill('#names', 'Jane Error');
    await page.fill('#email', 'jane@example.com');
    await page.fill('#date', '2027-08-15');
    await page.fill('#location', 'London');
    await page.selectOption('#formula', 'film');
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
    expect(receivedEmails.length).toBe(0);
  });
});
