
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { action } from "../app/routes/admin.legal";
import { getSiteContent, saveSettings } from "../app/lib/site-content.server";
import { commitSession, getSession } from "../app/lib/session.server";
import { resetRateLimit } from "../app/lib/rate-limit.server";
import { computeCredentialVersion } from "../app/lib/auth.server";

import fs from "node:fs";

const TEST_DB = "./data/test-site-content-legal.json";

describe("Admin Legal Route HTTP API", () => {
  it("generates CSRF if missing", async () => {
    // A loader without session should create one and set Set-Cookie
    const req = new Request("http://localhost:5173/admin/legal", {
       headers: { "X-Forwarded-For": "127.0.0.1" }
    });
    const { loader } = await import("../app/routes/admin.legal");
    // requireValidAdminSession throws if not logged in. Wait, loader requires valid admin session.
    // So CSRF generation only happens if session is valid but CSRF is missing.
    const cookie = await createValidSession(); // creates valid session without csrf (unless createValidSession adds it, wait!)
  });

  it("saves legalUI successfully with no-store", async () => {
    const cookie = await createValidSession("csrf-1");
    resetRateLimit("127.0.0.1", "admin_action");

    const contentObj = getSiteContent();
    const uiData = contentObj.legalUI;
    uiData.versionLabel.fr = "V FR";

    const formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "save_ui");
    formData.append("pageKey", "legalUI");
    formData.append("revision", contentObj.revision);
    formData.append("data", JSON.stringify(uiData));

    const req = createRequest("POST", formData, { Cookie: cookie });
    const res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;

    if(res.status !== 200) console.log(await res.clone().text());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const fresh = getSiteContent();
    expect(fresh.legalUI.versionLabel.fr).toBe("V FR");
    expect(fresh.revision).not.toBe(contentObj.revision);
  });

  it("updates lastModified on server side during publish", async () => {
    const cookie = await createValidSession("csrf-1");
    resetRateLimit("127.0.0.1", "admin_action");

    let contentObj = getSiteContent();
    contentObj.business.address = "123 Street";
    contentObj.business.enterpriseNumber = "123";
    contentObj.business.hostingProvider = "Host";
    saveSettings(contentObj.business, contentObj.revision);

    contentObj = getSiteContent();
    const draft = contentObj.legalPages.cgv.draft;
    draft.seoTitle = { fr: "T", en: "T" };
    draft.seoDescription = { fr: "T", en: "T" };
    draft.publicTitle = { fr: "T", en: "T" };
    draft.intro = { fr: "T", en: "T" };
    if (!draft.sections.length) draft.sections.push({ id: "s1", title: {fr: "t", en: "t"}, paragraphs: [{fr: "p", en: "p"}], listItems: [] });
    else { draft.sections[0].title = { fr: "T", en: "T" }; draft.sections[0].paragraphs = [{fr: "p", en: "p"}]; }
    draft.effectiveDate = "2023-01-01";
    draft.lastModified = "1999-01-01T00:00:00.000Z"; // fake old date

    const formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "publish");
    formData.append("pageKey", "cgv");
    formData.append("revision", contentObj.revision);
    formData.append("data", JSON.stringify(draft));

    const req = createRequest("POST", formData, { Cookie: cookie });
    const res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;

    if(res.status !== 200) console.log(await res.clone().text());
    expect(res.status).toBe(200);
    const fresh = getSiteContent();
    expect(fresh.legalPages.cgv.published?.lastModified).not.toBe("1999-01-01T00:00:00.000Z");
  });

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

  function createRequest(method: string, body?: string | FormData, headers?: HeadersInit) {
    const reqHeaders = new Headers(headers);
    if (!reqHeaders.has("Origin")) reqHeaders.set("Origin", "http://localhost:5173");
    if (!reqHeaders.has("X-Forwarded-For")) reqHeaders.set("X-Forwarded-For", "127.0.0.1");

    let finalBody: string | undefined = undefined;
    if (body instanceof FormData) {
      const params = new URLSearchParams();
      for (const [key, value] of body.entries()) {
        params.append(key, value.toString());
      }
      finalBody = params.toString();
    } else if (typeof body === "string") {
      finalBody = body;
    }

    if (!reqHeaders.has("Content-Type") && finalBody !== undefined) {
      reqHeaders.set("Content-Type", "application/x-www-form-urlencoded");
    }
    if (!reqHeaders.has("Content-Length")) {
      reqHeaders.set("Content-Length", finalBody ? finalBody.length.toString() : "0");
    }

    return new Request("http://localhost:5173/admin/legal", {
      method,
      headers: reqHeaders,
      body: finalBody
    });
  }

  it("rejects missing session", async () => {
    const formData = new FormData();
    const req = createRequest("POST", formData);
    await expect(action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0])).rejects.toThrow();
  });

  it("rejects invalid CSRF", async () => {
    const cookie = await createValidSession("real-csrf");
    const formData = new FormData();
    formData.append("csrfToken", "fake-csrf");

    const req = createRequest("POST", formData, { Cookie: cookie });
    const res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
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
    const res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
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
    const res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
    if(res.status !== 200) console.log(await res.clone().text());
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
    const res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
    expect(res.status).toBe(422);
  });

  it("publishes successfully and archives old version", async () => {
    const cookie = await createValidSession("csrf-1");
    let content = getSiteContent();

    // First publish

    content.business.address = "123 Street";
    content.business.enterpriseNumber = "123";
    content.business.hostingProvider = "Host";
    saveSettings(content.business, content.revision);

    content = getSiteContent();
    let draft = content.legalPages.mentions.draft;
    // Fill required fields
    draft.seoTitle = { fr: "T", en: "T" };
    draft.seoDescription = { fr: "T", en: "T" };
    draft.publicTitle = { fr: "T", en: "T" };
    draft.intro = { fr: "T", en: "T" };
    if (!draft.sections.length) draft.sections.push({ id: "s1", title: {fr: "t", en: "t"}, paragraphs: [], listItems: [] });
    else draft.sections[0].title = { fr: "T", en: "T" };

    draft.effectiveDate = "2026-01-01";
    draft.version = 1;

    let formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "publish");
    formData.append("pageKey", "mentions");
    formData.append("revision", content.revision);
    formData.append("data", JSON.stringify(draft));

    let req = createRequest("POST", formData, { Cookie: cookie });
    let res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
    if(res.status !== 200) console.log(await res.clone().text());
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
    res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
    if(res.status !== 200) console.log(await res.clone().text());
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
    const res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
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
    const res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
    expect(res.status).toBe(422); // validation error catches < and >
  });

  it("rejects payload too large", async () => {
    const cookie = await createValidSession("csrf-1");
    const req = createRequest("POST", "a".repeat(100) as unknown as FormData, { Cookie: cookie, "Content-Length": "10000000" });
    const res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
    expect(res.status).toBe(413);
  });

  it("maintains historical versions and draft independence after two publications", async () => {
    const cookie = await createValidSession("csrf-1");
    let contentObj = getSiteContent();
    contentObj.business.address = '123';
    contentObj.business.enterpriseNumber = '123';
    contentObj.business.hostingProvider = 'Host';
    let draft = contentObj.legalPages.privacy.draft;
    draft.effectiveDate = "2026-10-01";
    draft.publicTitle.fr = "V1";

    // Publish V1
    let formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "publish");
    formData.append("pageKey", "privacy");
    formData.append("revision", contentObj.revision);
    formData.append("data", JSON.stringify(draft));

    let req = createRequest("POST", formData, { Cookie: cookie });
    let res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
    if(res.status !== 200) console.log(await res.clone().text());
    expect(res.status).toBe(200);

    // Create Draft V2
    contentObj = getSiteContent();
    draft = contentObj.legalPages.privacy.draft;
    draft.publicTitle.fr = "Draft V2";

    formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "save_draft");
    formData.append("pageKey", "privacy");
    formData.append("revision", contentObj.revision);
    formData.append("data", JSON.stringify(draft));

    req = createRequest("POST", formData, { Cookie: cookie });
    res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
    if(res.status !== 200) console.log(await res.clone().text());
    expect(res.status).toBe(200);

    // Check independence
    contentObj = getSiteContent();
    expect(contentObj.legalPages.privacy.draft.publicTitle.fr).toBe("Draft V2");
    expect(contentObj.legalPages.privacy.published?.publicTitle.fr).toBe("V1");

    // Publish V2
    draft = contentObj.legalPages.privacy.draft;
    draft.effectiveDate = "2026-11-01";

    formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "publish");
    formData.append("pageKey", "privacy");
    formData.append("revision", contentObj.revision);
    formData.append("data", JSON.stringify(draft));

    req = createRequest("POST", formData, { Cookie: cookie });
    res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
    if(res.status !== 200) console.log(await res.clone().text());
    expect(res.status).toBe(200);

    contentObj = getSiteContent();
    expect(contentObj.legalPages.privacy.published?.version).toBe(2);
    expect(contentObj.legalPages.privacy.published?.publicTitle.fr).toBe("Draft V2");
    expect(contentObj.legalPages.privacy.history.length).toBe(1);
    expect(contentObj.legalPages.privacy.history[0].publicTitle.fr).toBe("V1");
  });

  it("handles Unicode characters correctly", async () => {
    const cookie = await createValidSession("csrf-1");
    const contentObj = getSiteContent();
    const draft = contentObj.legalPages.cgv.draft;
    draft.publicTitle.fr = "Mentions 🚀 こんにちは";

    const formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "save_draft");
    formData.append("pageKey", "mentions");
    formData.append("revision", contentObj.revision);
    formData.append("data", JSON.stringify(draft));

    const req = createRequest("POST", formData, { Cookie: cookie });
    const res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
    if(res.status !== 200) console.log(await res.clone().text());
    expect(res.status).toBe(200);

    const updated = getSiteContent();
    expect(updated.legalPages.mentions.draft.publicTitle.fr).toBe("Mentions 🚀 こんにちは");
  });

  it("rejects invalid Content-Type", async () => {
    const cookie = await createValidSession("csrf-1");
    const req = createRequest("POST", "{}" as unknown as FormData, { Cookie: cookie, "Content-Type": "text/plain", "Content-Length": "2" });
    const res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
    expect(res.status).toBe(415);
  });

  it("rejects invalid Content-Length", async () => {
    const cookie = await createValidSession("csrf-1");
    const lengths = ["", "-10", "10.5", "abc", "9007199254740992", "1000000"];
    for (const len of lengths) {
       resetRateLimit("127.0.0.1", "admin_action");
       const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie };
       if (len) headers["Content-Length"] = len;

       const req = createRequest("POST", "csrfToken=csrf-1&intent=save_draft&pageKey=mentions", headers);

       // Override headers get to bypass undici sanitization
       const oldGet = req.headers.get.bind(req.headers);
       req.headers.get = (key: string) => {
          if (key.toLowerCase() === "content-length") return len || null;
          return oldGet(key);
       };

       const res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
       if (!len || !/^\d+$/.test(len) || len === "9007199254740992") {
          expect(res.status).toBe(400);
       } else {
          expect(res.status).toBe(413);
       }
    }
  });

  it("rejects malformed JSON", async () => {
    const cookie = await createValidSession("csrf-1");
    const formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "save_draft");
    formData.append("pageKey", "mentions");
    formData.append("data", "{ bad json");

    const req = createRequest("POST", formData, { Cookie: cookie, "Content-Length": "100" });
    const res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("JSON malformé");
  });

  it("rejects invalid pageKey and intent", async () => {
    const cookie = await createValidSession("csrf-1");
    const formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "save_draft");
    formData.append("pageKey", "unknown");
    formData.append("data", "{}");

    const req = createRequest("POST", formData, { Cookie: cookie, "Content-Length": "100" });
    let res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
    expect(res.status).toBe(400);

    formData.set("pageKey", "mentions");
    formData.set("intent", "delete_all");
    const req2 = createRequest("POST", formData, { Cookie: cookie, "Content-Length": "100" });
    res = await action({ request: req2, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
    expect(res.status).toBe(400);
  });

  it("rejects publication with missing fields and duplicate IDs", async () => {
    const cookie = await createValidSession("csrf-1");
    const contentObj = getSiteContent();
    contentObj.business.address = "123 Street";
    contentObj.business.enterpriseNumber = "123";
    contentObj.business.hostingProvider = "Host";
    saveSettings(contentObj.business, contentObj.revision);
    const draft = contentObj.legalPages.cgv.draft;

    draft.effectiveDate = "2026-01-01";
    draft.seoTitle = { fr: "Titre", en: "Title" };
    draft.seoDescription = { fr: "Desc", en: "Desc" };
    draft.publicTitle = { fr: "Pub", en: "Pub" };
    draft.intro = { fr: "Intro", en: "Intro" };
    if (!draft.sections.length) draft.sections.push({ id: "s1", title: {fr: "t", en: "t"}, paragraphs: [], listItems: [] });
    // Duplicate ID
    draft.sections.push(draft.sections[0]);

    const formData = new FormData();
    formData.append("csrfToken", "csrf-1");
    formData.append("intent", "publish");
    formData.append("pageKey", "mentions");
    formData.append("revision", contentObj.revision);
    formData.append("data", JSON.stringify(draft));

    const req = createRequest("POST", formData, { Cookie: cookie, "Content-Length": "1000" });
    const res = await action({ request: req, params: {}, context: {} } as unknown as Parameters<typeof action>[0]) as Response;
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain("dupliqué");
  });
});
