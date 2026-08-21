import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export default async function globalTeardown() {
  const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
  const certsDir = path.resolve(currentDir, 'certs');
  
  if (fs.existsSync(certsDir)) {
    console.log('Cleaning up TLS certificates for E2E tests...');
    fs.rmSync(certsDir, { recursive: true, force: true });
    console.log('TLS certificates cleaned up successfully.');
  }
}
