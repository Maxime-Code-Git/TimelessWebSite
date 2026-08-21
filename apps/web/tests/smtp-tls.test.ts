import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SMTPServer } from "smtp-server";
import nodemailer from "nodemailer";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

describe("SMTP TLS Security", () => {
  let server: SMTPServer;
  let port: number;
  let certsDir: string;
  let keyPath: string;
  let certPath: string;

  beforeAll(async () => {
    // Generate certs in a unique temp directory
    certsDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-smtp-tls-"));
    keyPath = path.join(certsDir, "key.pem");
    certPath = path.join(certsDir, "cert.pem");

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

    execSync(
      `openssl req -nodes -new -x509 -keyout key.pem -out cert.pem -days 1 -config openssl-ca.cnf`,
      { cwd: certsDir, stdio: 'ignore' }
    );

    // Start SMTP server
    server = new SMTPServer({
      secure: false, // TLS is upgraded via STARTTLS
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      authOptional: true,
      onData(stream, session, callback) {
        stream.on("data", () => {});
        stream.on("end", callback);
      },
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.server.address();
        if (address && typeof address !== 'string') {
          port = address.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    fs.rmSync(certsDir, { recursive: true, force: true });
  });

  it("should successfully connect with valid CA", async () => {
    const transporter = nodemailer.createTransport({
      host: "127.0.0.1",
      port,
      secure: false,
      requireTLS: true,
      tls: {
        ca: [fs.readFileSync(certPath, "utf-8")],
        // No rejectUnauthorized: false! It defaults to true.
      },
    });

    await expect(transporter.verify()).resolves.toBe(true);
  });

  it("should fail to connect without CA (rejectUnauthorized is active)", async () => {
    const transporter = nodemailer.createTransport({
      host: "127.0.0.1",
      port,
      secure: false,
      requireTLS: true,
      tls: {
        // No CA provided, and default rejectUnauthorized: true
      },
    });

    await expect(transporter.verify()).rejects.toThrow(/self[- ]signed certificate/i);
  });
});
