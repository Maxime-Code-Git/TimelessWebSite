import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { processContactAction } from '../app/lib/contact.server';
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

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
      CONTACT_RATE_LIMIT_MAX: 2,
    }
  };
});

const sendContactEmailMock = vi.fn();
vi.mock("../app/lib/mailer.server", () => {
  return {
    sendContactEmail: (data: unknown) => sendContactEmailMock(data)
  };
});

describe('Contact Server Logic', () => {
  const TEST_DB = "./tests/rate-limit.test.db";
  let consoleSpy: MockInstance;
  let logSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

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
      message: "Un message de test",
      phone: "0477 12 34 56"
    };
  }

  it('should successfully process valid request in FR', async () => {
    const req = createRequest(getValidBody());
    sendContactEmailMock.mockResolvedValueOnce({ accepted: ["to@example.com"] });
    const result = await processContactAction(req, "fr");
    expect(result).toEqual({ success: true });
    expect(sendContactEmailMock).toHaveBeenCalledWith({
      names: "John Doe",
      email: "john@example.com",
      date: "2027-08-15",
      location: "Bruxelles",
      formula: "photo",
      message: "Un message de test",
      phone: "0477 12 34 56"
    });
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('should reject honeypot silently (without sending email)', async () => {
    const req = createRequest({ ...getValidBody(), website: "http://spam.com" });
    const result = await processContactAction(req, "fr");
    expect(result).toEqual({ error: "Requête invalide." });
    expect(sendContactEmailMock).not.toHaveBeenCalled();
  });

  it('should handle SMTP failure without fake success and without logging PII', async () => {
    const req = createRequest(getValidBody());
    sendContactEmailMock.mockRejectedValueOnce(new Error("SMTP Delivery Error: 550 Intentional rejection"));
    const result = await processContactAction(req, "fr");
    expect(result.error).toContain("Une erreur est survenue");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should reject missing fields', async () => {
    const req = createRequest({ names: "John Doe" });
    const result = await processContactAction(req, "fr");
    expect(result.error).toContain("remplir tous les champs obligatoires");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should enforce rate limiting and isolate independent IPs', async () => {
    const req1 = createRequest(getValidBody(), { "x-forwarded-for": "10.0.0.1" });
    const req2 = createRequest(getValidBody(), { "x-forwarded-for": "10.0.0.1" });
    const req3 = createRequest(getValidBody(), { "x-forwarded-for": "10.0.0.1" });
    const reqOtherIp = createRequest(getValidBody(), { "x-forwarded-for": "10.0.0.2" });

    sendContactEmailMock.mockResolvedValue({ accepted: ["to@example.com"] });

    await processContactAction(req1, "fr");
    await processContactAction(req2, "fr");

    const result3 = await processContactAction(req3, "fr");
    expect(result3.error).toContain("Trop de tentatives");

    const resultOther = await processContactAction(reqOtherIp, "fr");
    expect(resultOther).toEqual({ success: true });

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should reject IP spoofing (multiple IPs)', async () => {
    const req = createRequest(getValidBody(), { "x-forwarded-for": "10.0.0.1, 10.0.0.2" });
    const result = await processContactAction(req, "fr");
    expect(result.error).toContain("Configuration réseau");
  });

  it('should reject invalid IPs', async () => {
    const req = createRequest(getValidBody(), { "x-forwarded-for": "not-an-ip" });
    const result = await processContactAction(req, "fr");
    expect(result.error).toContain("Adresse IP invalide");
  });

  it('should reject impossible dates', async () => {
    const req = createRequest({ ...getValidBody(), date: "2027-02-30" });
    const result = await processContactAction(req, "fr");
    expect(result.error).toContain("impossible ou invalide");
  });

  it('should reject invalid phone format', async () => {
    const req = createRequest({ ...getValidBody(), phone: "invalid" });
    const result = await processContactAction(req, "fr");
    expect(result.error).toContain("téléphone invalide");
  });

  it('should handle malformed origin gracefully', async () => {
    const req = createRequest(getValidBody(), { "Origin": "not-a-url" });
    const result = await processContactAction(req, "fr");
    expect(result.error).toContain("Origine malformée");
  });

  it('should reject oversized body (Content-Length provided)', async () => {
    const req = createRequest(getValidBody(), { "content-length": "9999999" });
    const result = await processContactAction(req, "fr");
    expect(result.error).toContain("invalide ou trop volumineuse");
  });

  it('should reject oversized body (without Content-Length)', async () => {
    const chunks = [new Uint8Array(50 * 1024), new Uint8Array(60 * 1024)];
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(chunks[0]);
        controller.enqueue(chunks[1]);
        controller.close();
      }
    });
    const req = new Request("http://localhost:4173/fr/contact", {
      method: "POST",
      body: stream,
      headers: {
        "content-type": "multipart/form-data; boundary=----WebKitFormBoundary",
        "x-forwarded-for": "192.168.1.1",
      },
      // @ts-expect-error Node 18+ streaming request bodies in tests
      duplex: 'half'
    });
    const result = await processContactAction(req, "fr");
    expect(result.error).toContain("trop volumineuse");
  });
});
