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


describe("Real HTTP isolation for Portfolio Admin", () => {
  let serverProcess: ChildProcess;
  const PORT = 43212;
  const BASE_URL = `http://localhost:${PORT}`;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-portfolio-http-"));
  const dbPath = path.join(tempDir, "rate-limit.db");
  const siteContentPath = path.join(tempDir, "site-content.json");
  const portfolioContentPath = path.join(tempDir, "portfolio.json");
  const portfolioMediaPath = path.join(tempDir, "portfolio-media");

  const defaultSiteContentPath = path.resolve(__dirname, "../app/content/default-site-content.json");

  beforeAll(async () => {
    fs.copyFileSync(defaultSiteContentPath, siteContentPath);

    fs.writeFileSync(portfolioContentPath, JSON.stringify({
      schemaVersion: 2,
      revision: "00000000000000000000000000000000",
      updatedAt: new Date().toISOString(),
      categories: [],
      photos: [],
      video: null,
      watermark: { mode: "text", text: "Test", revision: "00000000000000000000000000000000", updatedAt: new Date().toISOString() }
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
          ADMIN_SESSION_SECRET: "12345678901234567890123456789012", // 32 chars
          SITE_CONTENT_PATH: siteContentPath,
          PORTFOLIO_CONTENT_PATH: portfolioContentPath,
          PORTFOLIO_MEDIA_PATH: portfolioMediaPath
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
      serverProcess.stderr?.on("data", (data) => console.error("Server error:", data.toString()));
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

  it("GET des quatre routes sans session -> 302 vers /admin", async () => {
    const routes = [
      "/admin/portfolio",
      "/admin/portfolio/watermark",
    ];
    for (const route of routes) {
      const res = await fetch(`${BASE_URL}${route}`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/admin");
    }
  });

  it("fichier corrompu + GET anonyme -> toujours redirection, sans lecture révélée", async () => {
    const corruptedData = Buffer.from("{ completely broken JSON");
    fs.writeFileSync(portfolioContentPath, corruptedData);

    const res = await fetch(`${BASE_URL}/admin/portfolio`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin");
    const html = await res.text();
    expect(html).not.toContain("completely broken JSON");
    expect(html).not.toContain(portfolioContentPath);

    fs.writeFileSync(portfolioContentPath, JSON.stringify({
      schemaVersion: 2,
      revision: "00000000000000000000000000000000",
      updatedAt: new Date().toISOString(),
      categories: [],
      photos: [],
      video: null,
      watermark: { mode: "text", text: "Test", revision: "00000000000000000000000000000000", updatedAt: new Date().toISOString() }
    }));
  });

  it("cookie anonyme signé avec CSRF mais sans admin valide -> redirection et destruction de session", async () => {
    const getRes = await fetch(`${BASE_URL}/admin`);
    const cookies = getRes.headers.get("Set-Cookie");

    const res = await fetch(`${BASE_URL}/admin/portfolio`, {
      headers: { "Cookie": cookies || "" },
      redirect: "manual"
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin");
    const setCookie = res.headers.get("Set-Cookie") || "";
    expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=thu, 01 jan 1970/);
  });

  async function login(): Promise<{ cookie: string; csrfToken: string }> {
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

    return { cookie: loginRes.headers.get("Set-Cookie") || anonCookie, csrfToken };
  }

  function getRevision(): string {
    return JSON.parse(fs.readFileSync(portfolioContentPath, "utf-8")).revision;
  }

  async function getValidCsrfToken(cookie: string): Promise<string> {
    const resGet = await fetch(`${BASE_URL}/admin/portfolio`, { headers: { Cookie: cookie } });
    const html = await resGet.text();
    const csrfMatch = html.match(/csrfToken[\\",: ]+([a-f0-9-]{36})/i);
    return csrfMatch ? csrfMatch[1] : "";
  }

  it("active='true' est accepté pour createCategory", async () => {
    const { cookie } = await login();
    const csrfToken = await getValidCsrfToken(cookie);

    const params = new URLSearchParams({
      intent: "createCategory",
      csrfToken,
      revision: getRevision(),
      nameFr: "Cat1",
      nameEn: "Cat1EN",
      slug: "cat-true",
      active: "true"
    });

    const res = await fetch(`${BASE_URL}/admin/portfolio`, {
      method: "POST",
      headers: { "Cookie": cookie, "Content-Type": "application/x-www-form-urlencoded", "Origin": BASE_URL },
      body: params
    });

    expect(res.status).toBe(200);

    const content = JSON.parse(fs.readFileSync(portfolioContentPath, "utf-8"));
    const category = content.categories.find((c: { slug: string; id: string; active: boolean }) => c.slug === "cat-true");
    expect(category).toBeDefined();
    expect(category.active).toBe(true);
  });

  it("active='false' est accepté pour updateCategory", async () => {
    const { cookie } = await login();
    const csrfToken = await getValidCsrfToken(cookie);

    const createParams = new URLSearchParams({
      intent: "createCategory",
      csrfToken,
      revision: getRevision(),
      nameFr: "CatFalse",
      nameEn: "CatFalseEN",
      slug: "cat-false",
      active: "true"
    });
    const createRes = await fetch(`${BASE_URL}/admin/portfolio`, {
      method: "POST",
      headers: { "Cookie": cookie, "Content-Type": "application/x-www-form-urlencoded", "Origin": BASE_URL },
      body: createParams
    });
    expect(createRes.status).toBe(200);

    const content = JSON.parse(fs.readFileSync(portfolioContentPath, "utf-8"));
    const categoryId = content.categories.find((c: { slug: string; id: string }) => c.slug === "cat-false").id;

    const params = new URLSearchParams({
      intent: "updateCategory",
      csrfToken,
      revision: getRevision(),
      categoryId,
      nameFr: "CatFalse",
      nameEn: "CatFalseEN",
      slug: "cat-false",
      active: "false"
    });

    const res = await fetch(`${BASE_URL}/admin/portfolio`, {
      method: "POST",
      headers: { "Cookie": cookie, "Content-Type": "application/x-www-form-urlencoded", "Origin": BASE_URL },
      body: params
    });

    expect(res.status).toBe(200);

    const afterContent = JSON.parse(fs.readFileSync(portfolioContentPath, "utf-8"));
    const updatedCategory = afterContent.categories.find((c: { id: string; active: boolean }) => c.id === categoryId);
    expect(updatedCategory.active).toBe(false);
  });

  it("active absent est rejeté", async () => {
    const { cookie } = await login();
    const csrfToken = await getValidCsrfToken(cookie);

    const beforeContent = fs.readFileSync(portfolioContentPath, "utf-8");

    const params = new URLSearchParams({
      intent: "createCategory",
      csrfToken,
      revision: getRevision(),
      nameFr: "Cat2",
      nameEn: "Cat2EN",
      slug: "cat-2",
      // active missing
    });

    const res = await fetch(`${BASE_URL}/admin/portfolio`, {
      method: "POST",
      headers: { "Cookie": cookie, "Content-Type": "application/x-www-form-urlencoded", "Origin": BASE_URL },
      body: params
    });

    expect(res.status).toBe(422);

    const afterContent = fs.readFileSync(portfolioContentPath, "utf-8");
    expect(afterContent).toBe(beforeContent);
  });

  it("valeur arbitraire pour active est rejetée", async () => {
    const { cookie } = await login();
    const csrfToken = await getValidCsrfToken(cookie);

    const beforeContent = fs.readFileSync(portfolioContentPath, "utf-8");

    const params = new URLSearchParams({
      intent: "createCategory",
      csrfToken,
      revision: getRevision(),
      nameFr: "Cat3",
      nameEn: "Cat3EN",
      slug: "cat-3",
      active: "yes" // invalid
    });

    const res = await fetch(`${BASE_URL}/admin/portfolio`, {
      method: "POST",
      headers: { "Cookie": cookie, "Content-Type": "application/x-www-form-urlencoded", "Origin": BASE_URL },
      body: params
    });

    expect(res.status).toBe(422);

    const afterContent = fs.readFileSync(portfolioContentPath, "utf-8");
    expect(afterContent).toBe(beforeContent);
  });

});
