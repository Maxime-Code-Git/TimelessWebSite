import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'url';
import { restoreDefaultSiteContent, writeSiteContent } from '../e2e/test-helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('E2E Isolation and Restoration Helpers', () => {
  let tempDir: string;
  let originalSiteContentPath: string | undefined;

  beforeEach(() => {
    originalSiteContentPath = process.env.SITE_CONTENT_PATH;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeless-e2e-vitest-'));
  });

  afterEach(() => {
    process.env.SITE_CONTENT_PATH = originalSiteContentPath;
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('restores valid JSON after simulated corruption', () => {
    const siteContentPath = path.join(tempDir, 'site-content.json');
    process.env.SITE_CONTENT_PATH = siteContentPath;

    // Simulate intentional corruption
    writeSiteContent('{ corrupted json');
    const rawCorrupted = fs.readFileSync(siteContentPath, 'utf8');
    expect(() => JSON.parse(rawCorrupted)).toThrow(SyntaxError);

    // Execute restore helper
    restoreDefaultSiteContent();

    // Verify file exists, is valid JSON, and matches default schema
    const rawRestored = fs.readFileSync(siteContentPath, 'utf8');
    const restoredJson = JSON.parse(rawRestored);
    expect(restoredJson).toHaveProperty('schemaVersion');
    expect(restoredJson).toHaveProperty('revision');
    expect(restoredJson).toHaveProperty('business');
    expect(restoredJson).toHaveProperty('legalPages');
  });

  it('does not silently ignore missing SITE_CONTENT_PATH', () => {
    delete process.env.SITE_CONTENT_PATH;
    expect(() => {
      writeSiteContent('{}');
    }).toThrow('SITE_CONTENT_PATH environment variable is not defined');
  });

  it('verifies the eight unpublished legal routes remain excluded from the normal public SEO contract', () => {
    const seoSpecPath = path.resolve(__dirname, '../e2e/seo.spec.ts');
    const seoSpecContent = fs.readFileSync(seoSpecPath, 'utf8');

    const unpublishedLegalPaths = [
      '/fr/mentions-legales',
      '/en/legal',
      '/fr/confidentialite',
      '/en/privacy',
      '/fr/cgv',
      '/en/terms',
      '/fr/cookies',
      '/en/cookies',
    ];

    // Extract ORDINARY_ROUTES block
    const ordinaryRoutesMatch = seoSpecContent.match(/const ORDINARY_ROUTES\s*=\s*\[([\s\S]*?)\];/);
    expect(ordinaryRoutesMatch).not.toBeNull();
    const ordinaryBlock = ordinaryRoutesMatch ? ordinaryRoutesMatch[1] : '';

    for (const legalPath of unpublishedLegalPaths) {
      expect(ordinaryBlock).not.toContain(`path: '${legalPath}'`);
    }

    // Verify UNPUBLISHED_LEGAL_ROUTES contains all eight routes
    const unpublishedMatch = seoSpecContent.match(/const UNPUBLISHED_LEGAL_ROUTES\s*=\s*\[([\s\S]*?)\];/);
    expect(unpublishedMatch).not.toBeNull();
    const unpublishedBlock = unpublishedMatch ? unpublishedMatch[1] : '';

    for (const legalPath of unpublishedLegalPaths) {
      expect(unpublishedBlock).toContain(`path: '${legalPath}'`);
    }

    // Verify 404, noindex, nofollow and no-store assertions are present
    expect(seoSpecContent).toContain('.toBe(404)');
    expect(seoSpecContent).toContain("toContain('noindex')");
    expect(seoSpecContent).toContain("toContain('nofollow')");
    expect(seoSpecContent).toContain("toContain('no-store')");
  });

  it('verifies that ScrollTop tests in rebrand.spec.ts use a valid page and deterministic scrolling', () => {
    const rebrandSpecPath = path.resolve(__dirname, '../e2e/rebrand.spec.ts');
    const rebrandContent = fs.readFileSync(rebrandSpecPath, 'utf8');

    // Must not rely on /fr/cgv or /en/terms for ScrollTop tests
    expect(rebrandContent).not.toContain("goto('/fr/cgv')");
    expect(rebrandContent).not.toContain("goto('/en/terms')");

    // Must not rely on page.mouse.wheel
    expect(rebrandContent).not.toContain('page.mouse.wheel');

    // Must use deterministic scrolling and threshold verification
    expect(rebrandContent).toContain('window.scrollTo');
    expect(rebrandContent).toContain('window.scrollY > window.innerHeight * 0.8');

    // Must verify document scrollability before testing scroll
    expect(rebrandContent).toContain('document.documentElement.scrollHeight > window.innerHeight');

    // Must restore default site content before scenarios
    expect(rebrandContent).toContain('restoreDefaultSiteContent()');
  });
});
