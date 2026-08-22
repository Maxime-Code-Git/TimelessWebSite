import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";

describe("Real HTTP isolation without admin config", () => {
  let serverProcess: ChildProcess;
  const PORT = 43210;
  const BASE_URL = `http://localhost:${PORT}`;

  beforeAll(async () => {
    return new Promise((resolve, reject) => {
      serverProcess = spawn("npm", ["run", "start"], {
        cwd: path.resolve(__dirname, ".."),
        env: {
          ...process.env,
          PORT: String(PORT),
          NODE_ENV: "production",
          PUBLIC_SITE_URL: BASE_URL,
          CONTACT_RATE_LIMIT_SECRET: "test-secret",
          RATE_LIMIT_DB_PATH: "./tests/rate-limit.test.db",
          SMTP_HOST: "localhost",
          SMTP_PORT: "2525",
          SMTP_USER: "test",
          SMTP_PASS: "test",
          SMTP_FROM: "from@example.com",
          SMTP_TO: "to@example.com",
          CONTACT_RATE_LIMIT_MAX: "10",
          TRUST_PROXY: "true",
          // Explicitly remove admin configs to test isolation
          ADMIN_PASSWORD_HASH: "",
          ADMIN_SESSION_SECRET: "",
        },
      });

      serverProcess.stdout?.on("data", (data) => {
        if (data.toString().includes(String(PORT))) {
          resolve(undefined);
        }
      });

      serverProcess.stderr?.on("data", (data) => {
        console.error("Server error:", data.toString());
      });

      serverProcess.on("error", (err) => {
        reject(err);
      });

      // Fallback timeout in case server doesn't log port exactly as expected
      setTimeout(resolve, 3000);
    });
  });

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it("GET /fr/ should return 200 OK", async () => {
    const res = await fetch(`${BASE_URL}/fr/`);
    expect(res.status).toBe(200);
  });

  it("GET /en/contact should return 200 OK", async () => {
    const res = await fetch(`${BASE_URL}/en/contact`);
    expect(res.status).toBe(200);
  });

  it("GET /admin should return 503 Service Unavailable", async () => {
    const res = await fetch(`${BASE_URL}/admin`);
    expect(res.status).toBe(503);
    const text = await res.text();
    // Ensure no secrets or stack traces are leaked
    expect(text).toContain("Administration temporairement indisponible");
    expect(text).not.toContain("ADMIN_SESSION_SECRET");
    expect(text).not.toContain("Error:");
  });

  it("POST /admin should return 503 Service Unavailable", async () => {
    const res = await fetch(`${BASE_URL}/admin`, {
      method: "POST",
      body: new URLSearchParams({ intent: "login", password: "test" }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
      },
    });
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).toContain("Administration temporairement indisponible");
  });
});

describe("Real HTTP isolation WITH valid admin config", () => {
  let serverProcess: ChildProcess;
  const PORT = 43211;
  const BASE_URL = `http://localhost:${PORT}`;

  beforeAll(async () => {
    return new Promise((resolve) => {
      serverProcess = spawn("npm", ["run", "start"], {
        cwd: path.resolve(__dirname, ".."),
        env: {
          ...process.env,
          PORT: String(PORT),
          NODE_ENV: "production",
          PUBLIC_SITE_URL: BASE_URL,
          CONTACT_RATE_LIMIT_SECRET: "test-secret",
          RATE_LIMIT_DB_PATH: "./tests/rate-limit.test.db",
          SMTP_HOST: "localhost",
          SMTP_PORT: "2525",
          SMTP_USER: "test",
          SMTP_PASS: "test",
          SMTP_FROM: "from@example.com",
          SMTP_TO: "to@example.com",
          CONTACT_RATE_LIMIT_MAX: "10",
          TRUST_PROXY: "true",
          ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=19456,t=2,p=1$abc$def",
          ADMIN_SESSION_SECRET: "12345678901234567890123456789012", // 32 chars
        },
      });

      serverProcess.stdout?.on("data", (data) => {
        if (data.toString().includes(String(PORT))) {
          resolve(undefined);
        }
      });

      setTimeout(resolve, 3000);
    });
  });

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it("GET /fr/ should return 200 OK", async () => {
    const res = await fetch(`${BASE_URL}/fr/`);
    expect(res.status).toBe(200);
  });

  it("GET /admin should return 200 OK", async () => {
    const res = await fetch(`${BASE_URL}/admin`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Se connecter");
  });
});
