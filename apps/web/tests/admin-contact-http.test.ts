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

describe("Admin Contact Route", () => {
  let serverProcess: ChildProcess;
  const PORT = 43216; // Different port to avoid conflict
  const BASE_URL = `http://localhost:${PORT}`;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-admin-contact-"));
  const siteContentPath = path.join(tempDir, "site-content.json");
  const defaultContentPath = path.resolve(__dirname, "../app/content/default-site-content.json");
  let validSessionCookie: string;
  let validCsrfToken: string;

  beforeAll(async () => {
    fs.copyFileSync(defaultContentPath, siteContentPath);

    return new Promise((resolve, reject) => {
      serverProcess = spawn(process.execPath, [serveBin, "./build/server/index.js"], {
        cwd: path.resolve(__dirname, ".."),
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: String(PORT),
          NODE_ENV: "production",
          PUBLIC_SITE_URL: BASE_URL,
          // Admin config
          ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=19456,t=2,p=1$xDSx00u+uSs9AcMqypmthw$ubmjWhg1XWL+Yp496qb5LLlTx0FK4lwqy9pvKa5ills", // password 'test'
          ADMIN_SESSION_SECRET: "12345678901234567890123456789012", // 32 chars
          SITE_CONTENT_PATH: siteContentPath,
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
          reject(new Error(`Server exited with code ${code}`));
        }
      });
    });
  });

  afterAll(async () => {
    await stopServer(serverProcess);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should authenticate and get csrf token", async () => {
    // 1. Get initial csrf token from /admin loader
    const getRes = await fetch(`${BASE_URL}/admin`);
    expect(getRes.status).toBe(200);
    const initialCookies = getRes.headers.getSetCookie();
    const initialCookieStr = initialCookies.find(c => c.startsWith("__admin_session="));
    const initialCookie = initialCookieStr ? initialCookieStr.split(";")[0] : "";
    const text = await getRes.text();
    const csrfMatch = text.match(/name="csrfToken" value="([^"]+)"/);
    const initialCsrf = csrfMatch ? csrfMatch[1] : "";

    const formData = new URLSearchParams();
    formData.append("intent", "login");
    formData.append("password", "test");
    formData.append("csrfToken", initialCsrf);

    const postRes = await fetch(`${BASE_URL}/admin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": initialCookie,
        "Origin": BASE_URL,
        "Referer": `${BASE_URL}/admin`,
        "x-forwarded-for": "127.0.0.1"
      },
      body: formData,
      redirect: "manual"
    });

    expect(postRes.status).toBe(302);
    expect(postRes.headers.get("location")).toBe("/admin");
    const authCookie = postRes.headers.get("set-cookie") || "";
    expect(authCookie).toContain("__admin_session=");
    validSessionCookie = authCookie;

    // Get the new CSRF token for the authenticated session
    const getAdminRes = await fetch(`${BASE_URL}/admin/contact`, {
      headers: { "Cookie": authCookie },
      redirect: "manual"
    });
    expect(getAdminRes.status).toBe(200);
    const adminText = await getAdminRes.text();
    const adminCsrfMatch = adminText.match(/name="csrfToken" value="([^"]+)"/);
    validCsrfToken = adminCsrfMatch ? adminCsrfMatch[1] : "";
    expect(validCsrfToken).toBeTruthy();

    const contactPageMatch = adminText.match(/name="contactPage" value="([^"]+)"/);
    const revisionMatch = adminText.match(/name="revision" value="([^"]+)"/);
    expect(contactPageMatch).toBeTruthy();
    expect(revisionMatch).toBeTruthy();
    
    // We parse the HTML encoded JSON
    const contactPageStr = contactPageMatch![1].replace(/&quot;/g, '"');
    
    // Save contactPage to use in next test
    fs.writeFileSync(path.join(tempDir, "currentContactPage.json"), contactPageStr);
    fs.writeFileSync(path.join(tempDir, "currentRevision.txt"), revisionMatch![1]);
  });

  it("should reject update if unauthenticated", async () => {
    const formData = new URLSearchParams();
    formData.append("csrfToken", validCsrfToken);
    
    const postRes = await fetch(`${BASE_URL}/admin/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "x-forwarded-for": "127.0.0.1"
      },
      body: formData,
      redirect: "manual"
    });
    
    // Redirects to /admin
    expect(postRes.status).toBe(302);
  });

  it("should successfully update contactPage with valid data", async () => {
    const currentContactPage = JSON.parse(fs.readFileSync(path.join(tempDir, "currentContactPage.json"), "utf8"));
    const currentRevision = fs.readFileSync(path.join(tempDir, "currentRevision.txt"), "utf8");
    
    // Update something
    currentContactPage.hero.title.fr = "Titre mis à jour !";
    
    const formData = new URLSearchParams();
    formData.append("csrfToken", validCsrfToken);
    formData.append("revision", currentRevision);
    formData.append("contactPage", JSON.stringify(currentContactPage));
    
    const postRes = await fetch(`${BASE_URL}/admin/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": validSessionCookie,
        "Origin": BASE_URL,
        "Referer": `${BASE_URL}/admin/contact`,
        "x-forwarded-for": "127.0.0.1"
      },
      body: formData,
      redirect: "manual"
    });
    
    expect(postRes.status).toBe(200);
    
    // Check if site content actually updated
    const fileContent = JSON.parse(fs.readFileSync(siteContentPath, "utf8"));
    expect(fileContent.contactPage.hero.title.fr).toBe("Titre mis à jour !");
  });
});
