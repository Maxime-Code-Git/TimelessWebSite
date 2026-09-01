import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

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
    
    // Create empty portfolio
    fs.writeFileSync(portfolioContentPath, JSON.stringify({
      schemaVersion: 1,
      revision: "00000000000000000000000000000000",
      updatedAt: new Date().toISOString(),
      projects: []
    }));

    return new Promise((resolve, reject) => {
      serverProcess = spawn("npm", ["run", "start"], {
        cwd: path.resolve(__dirname, ".."),
        env: {
          ...process.env,
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
      });

      const timeout = setTimeout(() => reject(new Error("Server startup timeout")), 15000);

      serverProcess.stdout?.on("data", (data) => {
        if (data.toString().includes(String(PORT))) {
          clearTimeout(timeout);
          resolve(undefined);
        }
      });
      serverProcess.stderr?.on("data", (data) => console.error("Server error:", data.toString()));
      serverProcess.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      serverProcess.on("exit", (code) => {
        clearTimeout(timeout);
        if (code !== 0 && code !== null) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });
    });
  });

  afterAll(() => {
    if (serverProcess) serverProcess.kill();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("GET des quatre routes sans session -> 302 vers /admin", async () => {
    const routes = [
      "/admin/portfolio",
      "/admin/portfolio/new",
      "/admin/portfolio/fake-id",
      "/admin/portfolio/fake-id/preview"
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

    // Restore
    fs.writeFileSync(portfolioContentPath, JSON.stringify({
      schemaVersion: 1,
      revision: "00000000000000000000000000000000",
      updatedAt: new Date().toISOString(),
      projects: []
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

  it("Full portfolio workflow with security errors", async () => {
    // Login
    const getRes = await fetch(`${BASE_URL}/admin`);
    const anonCookie = getRes.headers.get("Set-Cookie");
    const text = await getRes.text();
    const csrfMatch = text.match(/name="csrfToken" value="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : "";

    const loginRes = await fetch(`${BASE_URL}/admin`, {
      method: "POST",
      body: new URLSearchParams({ intent: "login", password: "test", csrfToken }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": BASE_URL,
        "Cookie": anonCookie || "",
        "x-forwarded-for": "127.0.0.1"
      },
      redirect: "manual",
    });
    expect(loginRes.status).toBe(302);
    const authCookie = loginRes.headers.get("Set-Cookie") || "";

    // GET /admin/portfolio/new to get CSRF and Revision
    const newPageRes = await fetch(`${BASE_URL}/admin/portfolio/new`, {
      headers: { "Cookie": authCookie }
    });
    const newPageText = await newPageRes.text();
    const csrfMatch2 = newPageText.match(/name="csrfToken" value="([^"]+)"/);
    const csrfToken2 = csrfMatch2 ? csrfMatch2[1] : "";
    const revMatch = newPageText.match(/name="revision" value="([^"]+)"/);
    let revision = revMatch ? revMatch[1] : "";

    // 1. méthode invalide -> 405
    const badMethodRes = await fetch(`${BASE_URL}/admin/portfolio/new`, {
      method: "PUT",
      headers: { "Cookie": authCookie }
    });
    expect(badMethodRes.status).toBe(405);

    // 2. Origin invalide -> 403
    const badOriginRes = await fetch(`${BASE_URL}/admin/portfolio/new`, {
      method: "POST",
      headers: { "Cookie": authCookie, "Origin": "http://evil.com" }
    });
    expect(badOriginRes.status).toBe(400);

    // 3. MIME invalide -> 415
    const badMimeRes = await fetch(`${BASE_URL}/admin/portfolio/new`, {
      method: "POST",
      headers: { "Cookie": authCookie, "Origin": BASE_URL, "Content-Type": "application/json" }
    });
    expect(badMimeRes.status).toBe(415);

    // 4. CSRF invalide -> 403
    const badCsrfRes = await fetch(`${BASE_URL}/admin/portfolio/new`, {
      method: "POST",
      headers: { "Cookie": authCookie, "Origin": BASE_URL, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: "invalid", revision })
    });
    expect(badCsrfRes.status).toBe(403);

    // 5. Création d'un brouillon
    const createRes = await fetch(`${BASE_URL}/admin/portfolio/new`, {
      method: "POST",
      headers: { "Cookie": authCookie, "Origin": BASE_URL, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ 
        csrfToken: csrfToken2, 
        revision,
        titleFr: "Titre FR",
        titleEn: "Title EN",
        descriptionFr: "Desc FR",
        descriptionEn: "Desc EN"
      }),
      redirect: "manual"
    });
    expect(createRes.status).toBe(302);
    
    // Check JSON content
    const portfolioContent = JSON.parse(fs.readFileSync(portfolioContentPath, "utf-8"));
    expect(portfolioContent.projects.length).toBe(1);
    const projectId = portfolioContent.projects[0].id;
    revision = portfolioContent.revision;

    // 6. Édition (succès)
    const editRes = await fetch(`${BASE_URL}/admin/portfolio/${projectId}`, {
      method: "POST",
      headers: { "Cookie": authCookie, "Origin": BASE_URL, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ 
        csrfToken: csrfToken2, 
        revision,
        titleFr: "Titre Modifié",
        titleEn: "Title Modified",
        slugFr: "titre-modifie",
        slugEn: "title-modified",
        descriptionFr: "Desc",
        descriptionEn: "Desc"
      }),
      redirect: "manual"
    });
    expect(editRes.status).toBe(302);
    revision = JSON.parse(fs.readFileSync(portfolioContentPath, "utf-8")).revision;

    // 7. ancienne révision sur création, édition, ordre et suppression -> 409
    const conflictRes = await fetch(`${BASE_URL}/admin/portfolio/${projectId}`, {
      method: "POST",
      headers: { "Cookie": authCookie, "Origin": BASE_URL, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ 
        csrfToken: csrfToken2, 
        revision: "oldrevision000",
        titleFr: "T", titleEn: "T", descriptionFr: "D", descriptionEn: "D"
      }),
    });
    expect(conflictRes.status).toBe(409);

    const conflictDelete = await fetch(`${BASE_URL}/admin/portfolio`, {
      method: "POST",
      headers: { "Cookie": authCookie, "Origin": BASE_URL, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ 
        intent: "delete",
        projectId,
        csrfToken: csrfToken2, 
        revision: "oldrevision000"
      }),
    });
    expect(conflictDelete.status).toBe(409);

    // 8. JSON corrompu -> 409, octets inchangés, aucun temp ni nouveau backup
    const corruptedData = Buffer.from("{ completely broken JSON");
    fs.writeFileSync(portfolioContentPath, corruptedData);
    const beforeFiles = fs.readdirSync(tempDir);

    const corruptEdit = await fetch(`${BASE_URL}/admin/portfolio/${projectId}`, {
      method: "POST",
      headers: { "Cookie": authCookie, "Origin": BASE_URL, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ 
        csrfToken: csrfToken2, 
        revision,
        titleFr: "T", titleEn: "T", descriptionFr: "D", descriptionEn: "D"
      }),
    });
    expect(corruptEdit.status).toBe(409);
    expect(fs.readFileSync(portfolioContentPath)).toEqual(corruptedData);
    expect(fs.readdirSync(tempDir)).toEqual(beforeFiles);
    
    // Restore
    fs.writeFileSync(portfolioContentPath, JSON.stringify({
      schemaVersion: 1,
      revision,
      updatedAt: new Date().toISOString(),
      projects: [{
        id: projectId,
        slug: { fr: "titre-modifie", en: "title-modified" },
        title: { fr: "Titre Modifié", en: "Title Modified" },
        description: { fr: "Desc", en: "Desc" },
        location: null,
        date: null,
        status: "draft",
        order: 0,
        coverPhotoId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        photos: []
      }]
    }));

    // 9. Suppression vide
    const delRes = await fetch(`${BASE_URL}/admin/portfolio`, {
      method: "POST",
      headers: { "Cookie": authCookie, "Origin": BASE_URL, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ 
        intent: "delete",
        projectId,
        csrfToken: csrfToken2, 
        revision
      }),
      redirect: "manual"
    });
    expect(delRes.status).toBe(302);
    const afterDel = JSON.parse(fs.readFileSync(portfolioContentPath, "utf-8"));
    expect(afterDel.projects.length).toBe(0);
    
    // données invalides -> 422
    const invalidData = await fetch(`${BASE_URL}/admin/portfolio/new`, {
      method: "POST",
      headers: { "Cookie": authCookie, "Origin": BASE_URL, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ 
        csrfToken: csrfToken2, 
        revision: afterDel.revision
        // missing fields
      }),
    });
    expect(invalidData.status).toBe(422);

    // corps trop grand -> 413
    const bigBody = new URLSearchParams({ csrfToken: csrfToken2, revision: afterDel.revision, titleFr: "a".repeat(1024 * 1024) });
    const bigRes = await fetch(`${BASE_URL}/admin/portfolio/new`, {
      method: "POST",
      headers: { "Cookie": authCookie, "Origin": BASE_URL, "Content-Type": "application/x-www-form-urlencoded" },
      body: bigBody
    });
    expect(bigRes.status).toBe(413);

    // check no leakage
    const text2 = await invalidData.text();
    expect(text2).not.toContain(portfolioContentPath);
    expect(text2).not.toContain("ADMIN_SESSION_SECRET");
  });
});
