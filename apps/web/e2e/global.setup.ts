import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export default async function globalSetup() {
  const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
  const certsDir = path.resolve(currentDir, 'certs');
  
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  const keyPath = path.join(certsDir, 'test-key.pem');
  const certPath = path.join(certsDir, 'test-cert.pem');

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.log('Generating self-signed TLS certificate for E2E tests...');
    
    // Create config file for OpenSSL
    const configPath = path.join(certsDir, 'openssl-ca.cnf');
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

    // Run OpenSSL to generate the certificate and key
    execSync(
      `openssl req -nodes -new -x509 -keyout test-key.pem -out test-cert.pem -days 3650 -config openssl-ca.cnf`,
      { cwd: certsDir, stdio: 'inherit' }
    );
    console.log('Self-signed TLS certificate generated successfully.');
  }
}
