import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultContentPath = path.resolve(__dirname, '../app/content/default-site-content.json');

export function writeSiteContent(content: string) {
  const targetPath = process.env.SITE_CONTENT_PATH;
  if (!targetPath) {
    return;
  }

  const tmpDir = os.tmpdir();
  const relPath = path.relative(tmpDir, targetPath);

  if (relPath.startsWith('..') || path.isAbsolute(relPath) || !relPath.startsWith('timeless-e2e-')) {
    throw new Error(`Security Exception: SITE_CONTENT_PATH (${targetPath}) must be within a timeless-e2e- directory in os.tmpdir()`);
  }

  fs.writeFileSync(targetPath, content, 'utf8');
}

export function restoreDefaultSiteContent() {
  const defaultContent = fs.readFileSync(defaultContentPath, 'utf8');
  writeSiteContent(defaultContent);
}
