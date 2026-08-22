import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const certsDir = path.resolve(currentDir, '../e2e/certs');
const certPath = path.join(certsDir, 'test-cert.pem');
const configPath = path.join(certsDir, 'openssl-ca.cnf');

function generateCerts() {
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  const configContent = `[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_ca
prompt = no
[req_distinguished_name]
CN = localhost
[v3_ca]
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
basicConstraints = critical, CA:true
keyUsage = critical, digitalSignature, cRLSign, keyCertSign
subjectAltName = @alt_names
[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
`;
  fs.writeFileSync(configPath, configContent);

  execSync(
    `openssl req -nodes -new -x509 -keyout test-key.pem -out test-cert.pem -days 3650 -config openssl-ca.cnf`,
    { cwd: certsDir, stdio: 'inherit' }
  );

  process.env.SMTP_CA_CERT = fs.readFileSync(certPath, 'utf-8');
}

function cleanupCerts() {
  if (fs.existsSync(certsDir)) {
    fs.rmSync(certsDir, { recursive: true, force: true });
  }
}

try {
  generateCerts();

  const args = process.argv.slice(2);
  const result = spawnSync('npx', ['playwright', 'test', ...args], {
    stdio: 'inherit',
    env: process.env
  });

  process.exitCode = result.status !== null ? result.status : 1;
} finally {
  cleanupCerts();
}
