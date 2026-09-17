import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { SMTPServer } from 'smtp-server';

const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const certsDir = path.resolve(currentDir, '../e2e/certs');
const certPath = path.join(certsDir, 'test-cert.pem');
const keyPath = path.join(certsDir, 'test-key.pem');
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

  process.env.ADMIN_SESSION_SECRET = 'e2e_test_session_secret_for_admin_only';
  process.env.SMTP_CA_CERT = fs.readFileSync(certPath, 'utf-8');
}

function cleanupCerts() {
  if (fs.existsSync(certsDir)) {
    fs.rmSync(certsDir, { recursive: true, force: true });
  }
}

async function run() {
  let e2eTempDir = '';
  let smtpServer = null;

  try {
    generateCerts();
    e2eTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeless-e2e-'));

    process.env.SITE_CONTENT_PATH = path.join(e2eTempDir, 'site-content.json');
    process.env.PORTFOLIO_CONTENT_PATH = path.join(e2eTempDir, 'portfolio.json');
    process.env.PORTFOLIO_MEDIA_PATH = path.join(e2eTempDir, 'portfolio-media');
    process.env.SITE_MEDIA_PATH = path.join(e2eTempDir, 'site-media');
    process.env.RATE_LIMIT_DB_PATH = path.join(e2eTempDir, 'rate-limit.sqlite');
    process.env.BOOKING_DB_PATH = path.join(e2eTempDir, 'bookings.sqlite');
    process.env.GALLERY_DB_PATH = path.join(e2eTempDir, 'galleries.sqlite');
    process.env.GALLERY_MEDIA_PATH = path.join(e2eTempDir, 'gallery-media');
    process.env.GALLERY_IMPORT_PATH = path.join(e2eTempDir, 'gallery-imports');
    process.env.GALLERY_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.NODE_ENV = 'test';

    fs.mkdirSync(process.env.GALLERY_MEDIA_PATH, { recursive: true });
    fs.mkdirSync(process.env.GALLERY_IMPORT_PATH, { recursive: true });

    // Start SMTP Server
    smtpServer = new SMTPServer({
      secure: false, // Use STARTTLS
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      onAuth(auth, session, callback) {
        if (auth.username === 'test@example.com' && auth.password === 'test') {
          callback(null, { user: 'test' });
        } else {
          return callback(new Error('Invalid username or password'));
        }
      },
      onData(stream, session, callback) {
        stream.on('data', () => {}); // Consume stream
        stream.on('end', callback);
      }
    });

    await new Promise((resolve) => {
      smtpServer.listen(2525, '127.0.0.1', () => {
        resolve();
      });
    });

    const args = process.argv.slice(2);
    const code = await new Promise((resolve, reject) => {
      const child = spawn('npx', ['playwright', 'test', ...args], {
        stdio: 'inherit',
        env: process.env
      });

      child.on('close', (code) => {
        resolve(code);
      });

      child.on('error', (err) => {
        reject(err);
      });
    });

    process.exitCode = code !== null ? code : 1;

  } finally {
    if (smtpServer) {
      smtpServer.close();
    }
    cleanupCerts();
    if (e2eTempDir && fs.existsSync(e2eTempDir)) {
      const resolvedRoot = path.resolve(os.tmpdir());
      const resolvedCandidate = path.resolve(e2eTempDir);
      const relative = path.relative(resolvedRoot, resolvedCandidate);
      if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative) || !path.basename(resolvedCandidate).startsWith('timeless-e2e-')) {
        console.error("Refusing to delete unsafe temporary directory:", e2eTempDir);
      } else {
        fs.rmSync(e2eTempDir, { recursive: true, force: true });
      }
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
