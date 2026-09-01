import { defineConfig, devices } from '@playwright/test';
import * as fs from 'node:fs';

if (!process.env.SITE_CONTENT_PATH || !process.env.RATE_LIMIT_DB_PATH || !process.env.PORTFOLIO_CONTENT_PATH || !process.env.PORTFOLIO_MEDIA_PATH) {
  throw new Error("Required env vars must be defined in the environment. Run with npm run test:e2e");
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  /* Maximum time one test can run for. */
  timeout: 30 * 1000,
  expect: {
    /**
     * Maximum time expect() should wait for the condition to be met.
     * For example in `await expect(locator).toHaveText();`
     */
    timeout: 5000
  },
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
    actionTimeout: 0,
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:4174',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    extraHTTPHeaders: {
      "x-forwarded-for": "127.0.0.1"
    }
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: {
      PORT: '4174',
      NODE_ENV: 'test',
      TRUST_PROXY: 'true',
      PUBLIC_SITE_URL: 'http://localhost:4174',
      SMTP_PORT: '2525',
      SMTP_USER: 'test@example.com',
      SMTP_PASS: 'test',
      SMTP_FROM: 'test@example.com',
      SMTP_TO: 'test@example.com',
      SMTP_HOST: 'localhost',
      SMTP_CA_CERT: fs.readFileSync('./e2e/certs/test-cert.pem', 'utf-8'),
      CONTACT_RATE_LIMIT_SECRET: 'testsecret',
      CONTACT_RATE_LIMIT_MAX: '100',
      RATE_LIMIT_DB_PATH: process.env.RATE_LIMIT_DB_PATH,
      SITE_CONTENT_PATH: process.env.SITE_CONTENT_PATH,
      PORTFOLIO_CONTENT_PATH: process.env.PORTFOLIO_CONTENT_PATH,
      PORTFOLIO_MEDIA_PATH: process.env.PORTFOLIO_MEDIA_PATH,
      ADMIN_PASSWORD_HASH: '$argon2id$v=19$m=19456,t=2,p=1$mA6OzU+rMEkQeBBnZfesFQ$1rIHIz/8BAyH0+GNXhYq8KDDu99lqaOTBtwGg1Lzczs',
      ADMIN_SESSION_SECRET: 'e2e_test_session_secret_for_admin_only',
    },
  },
});
