
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { action } from "../app/routes/admin.legal";
import { getSiteContent, getRawSiteContent } from "../app/lib/site-content.server";
import { commitSession, getSession } from "../app/lib/session.server";
import { resetRateLimit } from "../app/lib/rate-limit.server";
import { computeCredentialVersion } from "../app/lib/auth.server";
import * as crypto from "node:crypto";
import fs from "node:fs";

const TEST_DB = "./data/test-site-content-legal.json";

describe("Admin Legal Route HTTP API", () => {
  beforeAll(() => {
    process.env.SITE_CONTENT_PATH = TEST_DB;
    process.env.ADMIN_SESSION_SECRET = "12345678901234567890123456789012";
    process.env.ADMIN_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$xDSx00u+uSs9AcMqypmthw$ubmjWhg1XWL+Yp496qb5LLlTx0FK4lwqy9pvKa5ills";
    process.env.PUBLIC_SITE_URL = "http://localhost:5173";
    process.env.TRUST_PROXY = "true";
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  beforeEach(() => { resetRateLimit("127.0.0.1", "admin_action"); });

  afterAll(() => {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    delete process.env.SITE_CONTENT_PATH;
    delete process.env.ADMIN_SESSION_SECRET;
    delete process.env.ADMIN_PASSWORD_HASH;
  });

  async function createValidSession(csrfToken = "valid-csrf") {
    const session = await getSession("");
    session.set("adminId", "test-admin");
    session.set("credentialVersion", computeCredentialVersion());
    session.set("csrfToken", csrfToken);
    return await commitSession(session);
  }

  function createRequest(method: string, body?: FormData, headers?: HeadersInit) {
    const reqHeaders = new Headers(headers);
    if (!reqHeaders.has("Origin")) reqHeaders.set("Origin", "http://localhost:5173");
    if (!reqHeaders.has("X-Forwarded-For")) reqHeaders.set("X-Forwarded-For", "127.0.0.1");

    return new Request("http://localhost:5173/admin/legal", {
      method,
      headers: reqHeaders,
      body
    });
  }

  it("rejects missing session", async () => {
    const formData = new FormData();
    const req = createRequest("POST", formData);
    await expect(action({ request: req, params: {}, context: {} })).rejects.toThrow();
  });

  it("rejects invalid CSRF", async () => {
    const cookie = await createValidSession("real-csrf");
    const formData = new FormData();
    formData.append("csrfToken", "fake-csrf");
    
    const req = createRequest("POST", formData, { Cookie: cookie });
    const res = await action({ request: req, params: {}, context: {} }) as Response;
    expect(res.status).toBe(403);
  });
  
  it("rejects invalid Origin", async () => {
    const cookie = await createValidSession("real-csrf");
    const formData = new FormData();
    formData.append("csrfToken", "real-csrf");
    
    const reqHeaders = new Headers({ Cookie: cookie, Origin: "http://evil.com" });
    const req = new Request("http://localhost:5173/admin/legal", {
      method: "POST",
      headers: reqHeaders,
      body: formData
    });
    const res = await action({ request: req, params: {}, context: {} }) as Response;
    expect(res.status).toBe(403);
  });

  it("saves a draft successfully", async () => {
    const cookie = await createValidSession("csrf-1");
    const content = getSiteContent();
    const draft = content.legalPages.mentions.draft;
    draft.publicTitle.fr = "Titre Modifié";
    
    const formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "save_draft");
    formData.append("pageKey", "mentions");
    formData.append("revision", content.revision);
    formData.append("data", JSON.stringify(draft));

    const req = createRequest("POST", formData, { Cookie: cookie });
    const res = await action({ request: req, params: {}, context: {} }) as Response;
    expect(res.status).toBe(200);
    
    const newContent = getSiteContent();
    expect(newContent.legalPages.mentions.draft.publicTitle.fr).toBe("Titre Modifié");
    expect(newContent.legalPages.mentions.published).toBeNull();
  });
  
  it("rejects publication if effectiveDate is missing", async () => {
    const cookie = await createValidSession("csrf-1");
    const content = getSiteContent();
    const draft = content.legalPages.mentions.draft;
    draft.effectiveDate = null;
    
    const formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "publish");
    formData.append("pageKey", "mentions");
    formData.append("revision", content.revision);
    formData.append("data", JSON.stringify(draft));

    const req = createRequest("POST", formData, { Cookie: cookie });
    const res = await action({ request: req, params: {}, context: {} }) as Response;
    expect(res.status).toBe(400);
  });

  it("publishes successfully and archives old version", async () => {
    const cookie = await createValidSession("csrf-1");
    let content = getSiteContent();
    
    // First publish
    let draft = content.legalPages.mentions.draft;
    draft.effectiveDate = "2026-01-01";
    draft.version = 1;
    
    let formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "publish");
    formData.append("pageKey", "mentions");
    formData.append("revision", content.revision);
    formData.append("data", JSON.stringify(draft));

    let req = createRequest("POST", formData, { Cookie: cookie });
    let res = await action({ request: req, params: {}, context: {} }) as Response;
    expect(res.status).toBe(200);
    
    content = getSiteContent();
    expect(content.legalPages.mentions.published?.version).toBe(1);
    
    // Second publish
    draft = content.legalPages.mentions.draft;
    draft.effectiveDate = "2026-02-01";
    
    formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "publish");
    formData.append("pageKey", "mentions");
    formData.append("revision", content.revision);
    formData.append("data", JSON.stringify(draft));
    
    req = createRequest("POST", formData, { Cookie: cookie });
    res = await action({ request: req, params: {}, context: {} }) as Response;
    expect(res.status).toBe(200);
    
    content = getSiteContent();
    expect(content.legalPages.mentions.published?.version).toBe(2);
    expect(content.legalPages.mentions.history.length).toBe(1);
    expect(content.legalPages.mentions.history[0].version).toBe(1);
  });

  it("rejects revision conflict", async () => {
    const cookie = await createValidSession("csrf-1");
    const content = getSiteContent();
    const draft = content.legalPages.mentions.draft;
    
    const formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "save_draft");
    formData.append("pageKey", "mentions");
    formData.append("revision", "wrong-revision");
    formData.append("data", JSON.stringify(draft));

    const req = createRequest("POST", formData, { Cookie: cookie });
    const res = await action({ request: req, params: {}, context: {} }) as Response;
    expect(res.status).toBe(409);
  });
  
  it("rejects HTML/script injection via validation", async () => {
    const cookie = await createValidSession("csrf-1");
    const content = getSiteContent();
    const draft = content.legalPages.mentions.draft;
    draft.publicTitle.fr = "<script>alert(1)</script>";
    
    const formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "save_draft");
    formData.append("pageKey", "mentions");
    formData.append("revision", content.revision);
    formData.append("data", JSON.stringify(draft));

    const req = createRequest("POST", formData, { Cookie: cookie });
    const res = await action({ request: req, params: {}, context: {} }) as Response;
    expect(res.status).toBe(400); // validation error catches < and >
  });
  
  it("rejects payload too large", async () => {
    const cookie = await createValidSession("csrf-1");
    const req = createRequest("POST", "a".repeat(100) as any, { Cookie: cookie, "Content-Length": "10000000" });
    const res = await action({ request: req, params: {}, context: {} }) as Response;
    expect(res.status).toBe(413);
  });
});
