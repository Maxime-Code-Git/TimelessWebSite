import { test, expect } from '@playwright/test';
import { SMTPServer } from 'smtp-server';
import { DatabaseSync } from 'node:sqlite';

let smtpServer: SMTPServer;
let receivedEmails: { session: unknown; buffer: string }[] = [];
let smtpReject = false;
let smtpTimeout = false;

// eslint-disable-next-line no-empty-pattern
test.beforeAll(async ({}, workerInfo) => {
  if (workerInfo.project.name !== 'chromium') return;

  smtpServer = new SMTPServer({
    secure: false,
    disabledCommands: ['STARTTLS'],
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
    const db = new DatabaseSync('./data/db/rate-limit-test.sqlite');
    db.exec('DELETE FROM requests');
    db.close();
  } catch {
    // Ignore if db doesn't exist yet
  }
});

test.describe.configure({ mode: 'serial' });

test.describe('Contact Form (Phase 3 Backend)', () => {
  test.skip(({ isMobile }) => isMobile, 'SMTP server can only run in one project to avoid port conflicts');
  test('should successfully submit form and show success message', async ({ page }) => {
    await page.goto('/fr/contact');

    // Generate unique IP to avoid rate-limit clashes across tests
    const randomIp = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp });

    await page.fill('#names', 'John Doe');
    await page.fill('#email', 'john@example.com');
    await page.fill('#date', '2027-08-15');
    await page.fill('#location', 'Bruxelles');
    await page.selectOption('#formula', 'photo');
    await page.fill('#message', 'Un message de test.');
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Expect success message
    await expect(page.getByRole('status')).toContainText('Votre message a bien été envoyé');
    
    // Expect form to be cleared
    await expect(page.locator('#names')).toBeEmpty();
    
    // Expect email to be received
    expect(receivedEmails.length).toBe(1);
    expect(receivedEmails[0].buffer).toContain('John Doe');
    expect(receivedEmails[0].buffer).toContain('john@example.com');
  });

  test('should keep values and show error on SMTP failure', async ({ page }) => {
    smtpReject = true; // Mock rejection
    const randomIp = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp });

    await page.goto('/en/contact');
    
    await page.fill('#names', 'Jane Error');
    await page.fill('#email', 'jane@example.com');
    await page.fill('#date', '2027-08-15');
    await page.fill('#location', 'Paris');
    await page.selectOption('#formula', 'film');
    await page.fill('#message', 'Error test.');
    
    await page.click('button[type="submit"]');
    
    // Expect error message (generic)
    await expect(page.getByText('error occurred')).toBeVisible();
    
    // Expect values to be kept
    await expect(page.locator('#names')).toHaveValue('Jane Error');
    expect(receivedEmails.length).toBe(0);
  });

  test('should silently succeed/fail if honeypot is filled', async ({ page }) => {
    const randomIp = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp });

    await page.goto('/fr/contact');
    
    // Fill normal
    await page.fill('#names', 'Bot Spammer');
    await page.fill('#email', 'bot@example.com');
    await page.fill('#date', '2027-08-15');
    await page.fill('#location', 'Bruxelles');
    await page.selectOption('#formula', 'photo');
    await page.fill('#message', 'Spam message.');
    
    // Fill honeypot (we have to force it since it's hidden)
    await page.evaluate(() => {
      (document.getElementById('website') as HTMLInputElement).value = 'http://spam.com';
    });
    
    await page.click('button[type="submit"]');
    
    // Honeypot returns success immediately to trick bots
    // BUT does not send email.
    await expect(page.getByRole('status')).toContainText('Votre message a bien été envoyé');
    expect(receivedEmails.length).toBe(0);
  });

  test('should reject invalid email formatting and CRLF injections', async ({ page }) => {
    const randomIp = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp });

    await page.goto('/fr/contact');
    
    // Fill with CRLF in email to try to inject headers
    await page.fill('#names', 'Hacker');
    await page.fill('#email', 'hacker@example.com\r\nBcc: victim@example.com');
    await page.selectOption('#formula', 'photo');
    await page.fill('#message', 'Hack');
    
    await page.click('button[type="submit"]');
    
    // Native HTML validation might block CRLF in type="email", but if it passes:
    await expect(page.locator('[role="alert"]')).toBeVisible();
    expect(receivedEmails.length).toBe(0);
  });
});
