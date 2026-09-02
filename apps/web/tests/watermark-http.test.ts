import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { createRequire } from "node:module";

const requireModule = createRequire(import.meta.url);
const servePkgPath = requireModule.resolve("@react-router/serve/package.json");
const serveBin = path.join(path.dirname(servePkgPath), "bin.cjs");

async function stopServer(proc: ChildProcess | undefined) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  return new Promise<void>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGKILL");
        resolve();
      }
    }, 2000);
    proc.once("close", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve();
      }
    });
    proc.kill("SIGTERM");
  });
}


describe("Watermark Admin HTTP (Phase 3C.2A)", () => {
  let serverProcess: ChildProcess;
  const PORT = 43215;
  const BASE_URL = `http://localhost:${PORT}`;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-watermark-http-"));
  const dbPath = path.join(tempDir, "rate-limit.db");
  const siteContentPath = path.join(tempDir, "site-content.json");
  const portfolioContentPath = path.join(tempDir, "portfolio.json");
  const portfolioMediaPath = path.join(tempDir, "portfolio-media");

  const defaultSiteContentPath = path.resolve(__dirname, "../app/content/default-site-content.json");

  beforeAll(async () => {
    fs.copyFileSync(defaultSiteContentPath, siteContentPath);

    fs.writeFileSync(portfolioContentPath, JSON.stringify({
      schemaVersion: 1,
      revision: "00000000000000000000000000000000",
      updatedAt: new Date().toISOString(),
      projects: [],
    }));

    return new Promise((resolve, reject) => {
      serverProcess = spawn(process.execPath, [serveBin, "./build/server/index.js"], {
        cwd: path.resolve(__dirname, ".."),
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: String(PORT),
          NODE_ENV: "production",
          PUBLIC_SITE_URL: BASE_URL,
          CONTACT_RATE_LIMIT_SECRET: "test-secret",
          RATE_LIMIT_DB_PATH: dbPath,
          SMTP_HOST: "localhost",
          SMTP_PORT: "2525",
          SMTP_USER: "test",
          SMTP_PASS: "test",
          SMTP_FROM: "from@example.com",
          SMTP_TO: "to@example.com",
          CONTACT_RATE_LIMIT_MAX: "10",
          TRUST_PROXY: "true",
          ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=19456,t=2,p=1$xDSx00u+uSs9AcMqypmthw$ubmjWhg1XWL+Yp496qb5LLlTx0FK4lwqy9pvKa5ills",
          ADMIN_SESSION_SECRET: "12345678901234567890123456789012",
          SITE_CONTENT_PATH: siteContentPath,
          PORTFOLIO_CONTENT_PATH: portfolioContentPath,
          PORTFOLIO_MEDIA_PATH: portfolioMediaPath,
        },
        stdio: ["ignore", "pipe", "pipe"]
      });

      const timeout = setTimeout(() => {
        stopServer(serverProcess).finally(() => reject(new Error("Server startup timeout")));
      }, 15000);

      serverProcess.stdout?.on("data", (data) => {
        if (data.toString().includes(String(PORT))) {
          clearTimeout(timeout);
          resolve(undefined);
        }
      });
      serverProcess.stderr?.on("data", (data) => console.warn("Server error:", data.toString()));
      serverProcess.on("error", (err) => {
        clearTimeout(timeout);
        stopServer(serverProcess).finally(() => reject(err));
      });
      serverProcess.on("exit", (code) => {
        clearTimeout(timeout);
        if (code !== 0 && code !== null) {
          stopServer(serverProcess).finally(() => reject(new Error(`Server exited with code ${code}`)));
        }
      });
    });
  });

  afterAll(async () => {
    await stopServer(serverProcess);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function login(): Promise<string> {
    const getRes = await fetch(`${BASE_URL}/admin`);
    const anonCookie = getRes.headers.get("Set-Cookie") || "";

    const text = await getRes.text();
    const csrfMatch = text.match(/name="csrfToken"[^>]*value="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : "";

    const loginRes = await fetch(`${BASE_URL}/admin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": anonCookie,
        "Origin": BASE_URL,
        "x-forwarded-for": "127.0.0.1"
      },
      body: new URLSearchParams({ intent: "login", password: "test", csrfToken }),
      redirect: "manual",
    });

    return loginRes.headers.get("Set-Cookie") || anonCookie;
  }

  async function getCsrfAndRevision(authCookie: string): Promise<{ csrfToken: string; portfolioRevision: string }> {
    const res = await fetch(`${BASE_URL}/admin/portfolio/watermark`, {
      headers: { "Cookie": authCookie },
      redirect: "manual"
    });
    const html = await res.text();
    const csrfMatch = html.match(/name="csrfToken"[^>]*value="([^"]+)"/);
    const revisionMatch = html.match(/name="portfolioRevision"[^>]*value="([^"]+)"/);
    return {
      csrfToken: csrfMatch?.[1] || "",
      portfolioRevision: revisionMatch?.[1] || "",
    };
  }

  it("GET anonyme -> redirection /admin", async () => {
    const res = await fetch(`${BASE_URL}/admin/portfolio/watermark`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin");
  });

  it("cookie anonyme signe -> redirection et destruction", async () => {
    const getRes = await fetch(`${BASE_URL}/admin`);
    const cookies = getRes.headers.getSetCookie();
    const sessionCookie = cookies.find(c => c.includes("__session"))?.split(";")[0] || "";

    const res = await fetch(`${BASE_URL}/admin/portfolio/watermark`, {
      headers: { "Cookie": sessionCookie },
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin");

    // Vérifier la destruction du cookie
    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  it("modification authentifiee avec CSRF valide", async () => {
    const authCookie = await login();
    const { csrfToken, portfolioRevision } = await getCsrfAndRevision(authCookie);

    const res = await fetch(`${BASE_URL}/admin/portfolio/watermark`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": authCookie,
        "Origin": BASE_URL,
        "x-forwarded-for": "127.0.0.1"
      },
      body: `csrfToken=${encodeURIComponent(csrfToken)}&portfolioRevision=${encodeURIComponent(portfolioRevision)}&watermarkText=Mon+Studio`,
      redirect: "manual",
    });
    expect(res.status).toBe(200);

    const responseText = await res.text();
    expect(responseText).not.toContain(tempDir);
    expect(responseText).not.toContain("test-secret");
    expect(responseText).not.toContain("12345678901234567890123456789012");

    const updatedStr = fs.readFileSync(portfolioContentPath, "utf-8");
    const updated = JSON.parse(updatedStr);
    expect(updated.watermark.text).toBe("Mon Studio");
    expect(updated.revision).not.toBe(portfolioRevision);
    expect(updated.revision).toMatch(/^[a-f0-9]{32}$/);
    expect(updated.watermark.revision).toBeDefined();
    expect(updated.watermark.revision).toMatch(/^[a-f0-9]{32}$/);
  });

  it("Origin externe rejetee -> 400 (React Router protection)", async () => {
    const authCookie = await login();
    const { csrfToken, portfolioRevision } = await getCsrfAndRevision(authCookie);

    const res = await fetch(`${BASE_URL}/admin/portfolio/watermark`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": authCookie,
        "Origin": "https://evil.com",
      },
      body: `csrfToken=${encodeURIComponent(csrfToken)}&portfolioRevision=${encodeURIComponent(portfolioRevision)}&watermarkText=Hacked`,
      redirect: "manual",
    });
    // React Router's built-in CSRF protection returns 400
    expect(res.status).toBe(400);
  });

  it("MIME incorrect -> 415", async () => {
    const authCookie = await login();

    const res = await fetch(`${BASE_URL}/admin/portfolio/watermark`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": authCookie,
        "Origin": BASE_URL,
      },
      body: JSON.stringify({ watermarkText: "test" }),
      redirect: "manual",
    });
    expect(res.status).toBe(415);
  });

  it("CSRF incorrect -> 403", async () => {
    const authCookie = await login();
    const { portfolioRevision } = await getCsrfAndRevision(authCookie);

    const res = await fetch(`${BASE_URL}/admin/portfolio/watermark`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": authCookie,
        "Origin": BASE_URL,
      },
      body: `csrfToken=wrong-csrf-token&portfolioRevision=${encodeURIComponent(portfolioRevision)}&watermarkText=Test`,
      redirect: "manual",
    });
    expect(res.status).toBe(403);
  });

  it("body trop grand -> 413", async () => {
    const authCookie = await login();

    const largeBody = "x".repeat(200000);
    const res = await fetch(`${BASE_URL}/admin/portfolio/watermark`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": authCookie,
        "Origin": BASE_URL,
        "Connection": "close"
      },
      body: `csrfToken=test&portfolioRevision=test&watermarkText=${largeBody}`,
      redirect: "manual",
    });
    expect(res.status).toBe(413);
  });

  it("revision obsolete -> 409", async () => {
    const authCookie = await login();
    const { csrfToken } = await getCsrfAndRevision(authCookie);

    const res = await fetch(`${BASE_URL}/admin/portfolio/watermark`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": authCookie,
        "Origin": BASE_URL,
      },
      body: `csrfToken=${encodeURIComponent(csrfToken)}&portfolioRevision=stale_stale_stale_stale_stale_s&watermarkText=Test`,
      redirect: "manual",
    });
    expect(res.status).toBe(409);
  });

  it("methode non-POST -> 405 et JSON inchange", async () => {
    const authCookie = await login();
    const beforeContent = fs.readFileSync(portfolioContentPath, "utf-8");

    const methods = ["PUT", "DELETE"];
    for (const method of methods) {
      const res = await fetch(`${BASE_URL}/admin/portfolio/watermark`, {
        method,
        headers: {
          "Cookie": authCookie,
          "Origin": BASE_URL,
        },
        redirect: "manual",
      });
      expect(res.status).toBe(405);

      const afterContent = fs.readFileSync(portfolioContentPath, "utf-8");
      expect(afterContent).toBe(beforeContent);
    }
  });

  it("JSON corrompu -> 409 et octets inchanges", async () => {
    const authCookie = await login();
    const { csrfToken, portfolioRevision } = await getCsrfAndRevision(authCookie);

    const oldFiles = fs.readdirSync(tempDir);
    const existingBackups = oldFiles.filter(f => f.includes(".bak"));

    // Create a Map of name -> buffer instead of sorted arrays
    const backupMap = new Map<string, Buffer>();
    for (const f of existingBackups) {
      backupMap.set(f, fs.readFileSync(path.join(tempDir, f)));
    }

    const corruptedContent = "{ completely broken";
    fs.writeFileSync(portfolioContentPath, corruptedContent);

    try {
      const res = await fetch(`${BASE_URL}/admin/portfolio/watermark`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": authCookie,
          "Origin": BASE_URL,
        },
        body: `csrfToken=${encodeURIComponent(csrfToken)}&portfolioRevision=${encodeURIComponent(portfolioRevision)}&watermarkText=Test`,
        redirect: "manual",
      });

      expect(res.status).toBe(409);

      const afterContent = fs.readFileSync(portfolioContentPath, "utf-8");
      expect(afterContent).toBe(corruptedContent);

      const currentFiles = fs.readdirSync(tempDir);
      const currentBackups = currentFiles.filter(f => f.includes(".bak"));

      expect(currentBackups.length).toBe(existingBackups.length);

      for (const f of currentBackups) {
        expect(backupMap.has(f)).toBe(true);
        const currentBuf = fs.readFileSync(path.join(tempDir, f));
        expect(currentBuf.equals(backupMap.get(f)!)).toBe(true);
      }

      expect(currentFiles.filter(f => f.includes(".tmp"))).toHaveLength(0);
    } finally {
      fs.writeFileSync(portfolioContentPath, JSON.stringify({
        schemaVersion: 1,
        revision: "00000000000000000000000000000000",
        updatedAt: new Date().toISOString(),
        projects: [],
      }));
    }
  });

  it("watermark route should have Cache-Control and X-Robots-Tag headers", async () => {
    const authCookie = await login();
    const res = await fetch(`${BASE_URL}/admin/portfolio/watermark`, {
      headers: { "Cookie": authCookie },
      redirect: "manual"
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(res.headers.get("X-Robots-Tag")).toContain("nofollow");
  });
});
