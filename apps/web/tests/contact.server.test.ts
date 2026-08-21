import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processContactAction } from '../app/lib/contact.server';
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

// Mock env.server so we don't need real environment variables
vi.mock("../app/lib/env.server", () => {
  return {
    ENV: {
      PUBLIC_SITE_URL: "http://localhost:4173",
      TRUST_PROXY: true,
      CONTACT_RATE_LIMIT_SECRET: "test-secret",
      RATE_LIMIT_DB_PATH: "./tests/rate-limit.test.db",
      SMTP_HOST: "localhost",
      SMTP_PORT: 2525,
      SMTP_USER: "test",
      SMTP_PASS: "test",
      SMTP_FROM: "from@example.com",
      SMTP_TO: "to@example.com",
    }
  };
});

// Mock mailer to avoid hitting any real SMTP server in unit tests
const sendContactEmailMock = vi.fn();
vi.mock("../app/lib/mailer.server", () => {
  return {
    sendContactEmail: (data: unknown) => sendContactEmailMock(data)
  };
});

describe('Contact Server Logic', () => {
  const TEST_DB = "./tests/rate-limit.test.db";
  
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONTACT_RATE_LIMIT_MAX = "2"; // Use 2 for test
    if (fs.existsSync(TEST_DB)) {
      const db = new DatabaseSync(TEST_DB);
      db.exec("DELETE FROM requests");
      db.close();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createRequest(body: Record<string, string>, headers: Record<string, string> = {}) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(body)) {
      formData.append(key, value);
    }
    
    return new Request("http://localhost:4173/fr/contact", {
      method: "POST",
      body: formData,
      headers: {
        "Origin": "http://localhost:4173",
        "x-forwarded-for": "192.168.1.1",
        ...headers
      }
    });
  }

  function getValidBody() {
    return {
      names: "John Doe",
      email: "john@example.com",
      date: "2027-08-15",
      location: "Bruxelles",
      formula: "photo",
      message: "Un message de test"
    };
  }

  it('should reject honeypot silently (without sending email)', async () => {
    const req = createRequest({ ...getValidBody(), website: "http://spam.com" });
    const result = await processContactAction(req, "fr");
    expect(result).toEqual({ error: "Requête invalide." });
    expect(sendContactEmailMock).not.toHaveBeenCalled();
  });

  it('should reject missing fields', async () => {
    const req = createRequest({ names: "John Doe" }); // Missing others
    const result = await processContactAction(req, "fr");
    expect(result.error).toContain("remplir tous les champs obligatoires");
    expect(sendContactEmailMock).not.toHaveBeenCalled();
  });

  it('should reject invalid email', async () => {
    const req = createRequest({ ...getValidBody(), email: "not-an-email" });
    const result = await processContactAction(req, "fr");
    expect(result.error).toContain("Adresse email invalide");
    expect(sendContactEmailMock).not.toHaveBeenCalled();
  });

  it('should enforce rate limiting', async () => {
    const req1 = createRequest(getValidBody(), { "x-forwarded-for": "10.0.0.1" });
    const req2 = createRequest(getValidBody(), { "x-forwarded-for": "10.0.0.1" });
    const req3 = createRequest(getValidBody(), { "x-forwarded-for": "10.0.0.1" });

    // Success 1
    sendContactEmailMock.mockResolvedValueOnce({ accepted: ["to@example.com"] });
    await processContactAction(req1, "fr");
    
    // Success 2
    sendContactEmailMock.mockResolvedValueOnce({ accepted: ["to@example.com"] });
    await processContactAction(req2, "fr");
    
    // Rate limit 3
    const result3 = await processContactAction(req3, "fr");
    expect(result3.error).toContain("Trop de tentatives");
    expect(sendContactEmailMock).toHaveBeenCalledTimes(2); // Only twice!
  });

  it('should reject CRLF injection in email/names', async () => {
    const req = createRequest({ ...getValidBody(), names: "Hack\r\nBcc: victim" });
    const result = await processContactAction(req, "fr");
    expect(result.error).toContain("Caractères non autorisés");
  });

  it('should reject oversized body early', async () => {
    const req = createRequest(getValidBody(), { "content-length": "9999999" });
    const result = await processContactAction(req, "fr");
    expect(result.error).toContain("trop volumineuse");
  });
});
