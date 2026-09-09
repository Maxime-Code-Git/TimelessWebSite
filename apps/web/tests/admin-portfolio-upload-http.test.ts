import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "node:os";
import * as crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { loader as mediaLoader } from "../app/routes/admin.portfolio.media.$photoId.$variant";
import { loader as publicMediaLoader } from "../app/routes/portfolio.media.$photoId.$variant";
import { action } from '../app/routes/admin.portfolio.upload';
import * as sessionServer from "../app/lib/session.server";
import * as portfolioContent from "../app/lib/portfolio-content.server";
import { atomicWriteJson } from "../app/lib/atomic-fs.server";
import { RevisionConflictError } from "../app/lib/site-content.server";
import { RouterContextProvider, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";

vi.mock("../app/lib/env.server", () => ({
  ENV: {
    get ADMIN_HASH() { return process.env.ADMIN_HASH || "hash"; },
    get ADMIN_PASSWORD_HASH() { return process.env.ADMIN_PASSWORD_HASH || "$argon2id$v=19$m=65536,t=3,p=4$somehash$somehash"; },
    get ADMIN_SALT() { return process.env.ADMIN_SALT || "salt"; },
    get ADMIN_SESSION_SECRET() { return process.env.ADMIN_SESSION_SECRET || "A".repeat(32); },
    get SESSION_SECRET() { return process.env.SESSION_SECRET || "secret"; },
    get PUBLIC_SITE_URL() { return process.env.PUBLIC_SITE_URL || "http://localhost"; },
    get PORTFOLIO_SECRET() { return process.env.PORTFOLIO_SECRET || "A".repeat(32); },
    get PORTFOLIO_CONTENT_PATH() { return process.env.PORTFOLIO_CONTENT_PATH || ""; },
    get PORTFOLIO_MEDIA_PATH() { return process.env.PORTFOLIO_MEDIA_PATH || ""; },
  }
}));

let globalTimeOffset = 1000;

describe("admin-portfolio-upload-http.test.ts", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-upload-http-"));
    process.env.PORTFOLIO_CONTENT_PATH = path.join(tempDir, "portfolio.json");
    process.env.PORTFOLIO_MEDIA_PATH = path.join(tempDir, "media");
    fs.mkdirSync(process.env.PORTFOLIO_MEDIA_PATH, { recursive: true });

    const initialPortfolio = {
      schemaVersion: 2,
      revision: "a".repeat(32),
      updatedAt: new Date().toISOString(),
      categories: [],
      photos: [],
      video: null,
      watermark: { mode: "text", text: "Test", revision: "a".repeat(32), updatedAt: new Date().toISOString() }
    };
    atomicWriteJson(process.env.PORTFOLIO_CONTENT_PATH, initialPortfolio);

    // Invalidate cache by setting mtime to current Date.now() + unique offset
    const time = Date.now() + globalTimeOffset++;
    fs.utimesSync(process.env.PORTFOLIO_CONTENT_PATH, time / 1000, time / 1000);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const createRequest = (opts: {
    body?: Buffer | string,
    contentType?: string,
    cookie?: string,
    csrfToken?: string,
    revision?: string,
    method?: string,
    origin?: string
  }) => {
    const headers = new Headers();
    if (opts.cookie) headers.set("Cookie", opts.cookie);
    if (opts.csrfToken) headers.set("x-csrf-token", opts.csrfToken);
    if (opts.revision) headers.set("x-portfolio-revision", opts.revision);
    if (opts.contentType) headers.set("Content-Type", opts.contentType);
    if (opts.origin) {
      headers.set("Origin", opts.origin);
      headers.set("Host", "localhost");
    }

    let requestBody: BodyInit | undefined;
    if (typeof opts.body === "string") {
      requestBody = opts.body;
    } else if (Buffer.isBuffer(opts.body)) {
      const copiedBody = new Uint8Array(opts.body.byteLength);
      copiedBody.set(opts.body);
      requestBody = copiedBody;
    }

    return new Request("http://localhost/admin/portfolio/upload", {
      method: opts.method || "POST",
      headers,
      body: requestBody,
    });
  };

  const createActionArgs = (request: Request): ActionFunctionArgs => ({
    request,
    url: new URL(request.url),
    pattern: "/admin/portfolio/upload",
    params: {},
    context: new RouterContextProvider(),
  });

  const getValidCookieAndCsrf = async () => {
    const session = await sessionServer.getSession("");
    session.set("adminId", "admin");
    const hmac = crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET || "A".repeat(32));
    hmac.update(process.env.ADMIN_PASSWORD_HASH || "$argon2id$v=19$m=65536,t=3,p=4$somehash$somehash");
    session.set("credentialVersion", hmac.digest("base64url").slice(0, 32));
    const csrfToken = "valid-csrf";
    session.set("csrfToken", csrfToken);
    const cookie = await sessionServer.commitSession(session);
    return { cookie, csrfToken };
  };

  it("rejects GET, PUT, PATCH, DELETE with 405 and Allow: POST", async () => {
    const methods = ["GET", "PUT", "PATCH", "DELETE"];
    for (const method of methods) {
      const req = createRequest({ method });
      const resAction = await action(createActionArgs(req));
      expect(resAction.status).toBe(405);
      expect(resAction.headers.get("Allow")).toBe("POST");
    }
  });

  it("rejects request without session (302 redirect to /admin)", async () => {
    const req = createRequest({ method: "POST" });
    try {
      await action(createActionArgs(req));
      expect.fail("Should have thrown a 302 response");
    } catch (res: unknown) {
      expect((res as Response).status).toBe(302);
    }
  });

  it("rejects invalid content type (415)", async () => {
    const { cookie, csrfToken } = await getValidCookieAndCsrf();
    const req = createRequest({
      method: "POST", cookie, csrfToken, origin: "http://localhost",
      contentType: "application/json", body: "{}"
    });
    const res = await action(createActionArgs(req));
    expect(res.status).toBe(415);
  });

  it("interrupts > 50MB and cleans up", async () => {
    const { cookie, csrfToken } = await getValidCookieAndCsrf();
    const boundary = "------Boundary" + Date.now();
    const contentType = "multipart/form-data; boundary=" + boundary;
    const chunks = [];
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="large.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`));
    const max = 50 * 1024 * 1024 + 1024;
    const chunkSize = 1024 * 1024;
    for (let i = 0; i < max / chunkSize; i++) {
       chunks.push(Buffer.alloc(chunkSize, "A"));
    }
    chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(chunks);
    const req = createRequest({ method: "POST", cookie, csrfToken, origin: "http://localhost", contentType, body, revision: "a".repeat(32) });
    const res = await action(createActionArgs(req));
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.error).toMatch(/large/i);
  }, 10000);

  it("rejects invalid format (e.g. text/plain)", async () => {
    const { cookie, csrfToken } = await getValidCookieAndCsrf();
    const boundary = "------Boundary" + Date.now();
    const contentType = "multipart/form-data; boundary=" + boundary;
    const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--${boundary}--\r\n`);
    const req = createRequest({ method: "POST", cookie, csrfToken, origin: "http://localhost", contentType, body, revision: "a".repeat(32) });
    const res = await action(createActionArgs(req));
    expect(res.status).toBe(415);
    const json = await res.json();
    expect(json.error).toMatch(/Unsupported image type/i);
  });

  it("rolls back files if JSON update fails", async () => {
    const portfolioImage = await import("../app/lib/portfolio-image.server");
    let originalPath = "";
    let variantPath = "";
    vi.spyOn(portfolioImage, "processImage").mockImplementation(async (src, tmp, photoId) => {
      const generatedFileId = "1".repeat(32);
      originalPath = path.join(process.env.PORTFOLIO_MEDIA_PATH!, "global-v2", "photos", photoId, "originals", generatedFileId + ".jpeg");
      variantPath = path.join(process.env.PORTFOLIO_MEDIA_PATH!, "global-v2", "photos", photoId, "480p", generatedFileId + "-480p.webp");

      fs.mkdirSync(path.dirname(originalPath), { recursive: true });
      fs.mkdirSync(path.dirname(variantPath), { recursive: true });
      fs.writeFileSync(originalPath, "original");
      fs.writeFileSync(variantPath, "variant");
      return {
      fileId: generatedFileId,
      originalFormat: "jpeg",
      originalWidth: 800,
      originalHeight: 600,
      variants: [{ name: "480p", width: 480, height: 360, sizeBytes: 4, fileId: generatedFileId + "-480p" }],
      appliedWatermarkRevision: "a".repeat(32)
      };
    });
    vi.spyOn(portfolioContent, "addPhotoToPortfolio").mockImplementation(() => {
      throw new RevisionConflictError();
    });

    const { cookie, csrfToken } = await getValidCookieAndCsrf();

    const formData = new FormData();
    const tinyJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00]);
    formData.append("file", new Blob([tinyJpeg], { type: "image/jpeg" }), "test.jpg");

    const req = new Request("http://localhost/admin/portfolio/upload", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "x-csrf-token": csrfToken,
        "x-portfolio-revision": "a".repeat(32),
        "Origin": "http://localhost"
      },
      body: formData
    });

    const res = await action(createActionArgs(req));
    const responseBody = await res.json();
    expect(res.status, JSON.stringify(responseBody)).toBe(409);

    expect(fs.existsSync(originalPath)).toBe(false);
    expect(fs.existsSync(variantPath)).toBe(false);

    vi.spyOn(portfolioContent, "addPhotoToPortfolio").mockRestore();
    vi.spyOn(portfolioImage, "processImage").mockRestore();
  });

  it("handles two sequential uploads correctly using newRevision", async () => {
    const portfolioImage = await import("../app/lib/portfolio-image.server");
    vi.spyOn(portfolioImage, "processImage").mockImplementation(async (_src, _tmp, _photoId) => {
      return {
        fileId: "1".repeat(32),
        originalFormat: "jpeg",
        originalWidth: 800,
        originalHeight: 600,
        variants: [{ name: "480p", width: 480, height: 360, sizeBytes: 4, fileId: "1".repeat(32) + "-480p" }],
        appliedWatermarkRevision: "a".repeat(32)
      };
    });

    const { cookie, csrfToken } = await getValidCookieAndCsrf();
    const revision = "a".repeat(32);

    const tinyJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00]);

    // First upload
    const body1 = Buffer.concat([
      Buffer.from("--test-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test1.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n"),
      tinyJpeg,
      Buffer.from("\r\n--test-boundary--\r\n")
    ]);

    const req1 = createRequest({
      body: body1,
      contentType: "multipart/form-data; boundary=test-boundary",
      cookie,
      csrfToken,
      revision,
      origin: "http://localhost"
    });

    const res1 = await action(createActionArgs(req1));
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.newRevision).toBeDefined();
    expect(data1.newRevision).not.toBe(revision);

    // Second upload using the new revision
    const body2 = Buffer.concat([
      Buffer.from("--test-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test2.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n"),
      tinyJpeg,
      Buffer.from("\r\n--test-boundary--\r\n")
    ]);

    const req2 = createRequest({
      body: body2,
      contentType: "multipart/form-data; boundary=test-boundary",
      cookie,
      csrfToken,
      revision: data1.newRevision,
      origin: "http://localhost"
    });

    const res2 = await action(createActionArgs(req2));
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.newRevision).toBeDefined();
    expect(data2.newRevision).not.toBe(data1.newRevision);

    vi.spyOn(portfolioImage, "processImage").mockRestore();
  });
});

describe("admin-portfolio-media-http.test.ts", () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-media-http-"));
    process.env.PORTFOLIO_MEDIA_PATH = path.join(tempDir, "media");
    process.env.PORTFOLIO_CONTENT_PATH = path.join(tempDir, "portfolio.json");

    const initialPortfolio2 = {
      schemaVersion: 2,
      revision: "a".repeat(32),
      updatedAt: new Date().toISOString(),
      categories: [{ id: "22222222-2222-4222-8222-222222222222", name: { fr: "Cat", en: "Cat" }, slug: "cat", order: 0, active: true }],
      photos: [{
          id: "33333333-3333-4333-8333-333333333333",
          fileId: "1".repeat(32),
          originalFormat: "jpeg",
          originalWidth: 800,
          originalHeight: 600,
          categoryId: "22222222-2222-4222-8222-222222222222",
          visible: true,
          order: 0,
          alt: { fr: "A", en: "A" },
          variants: [{
            name: "480p",
            width: 480,
            height: 320,
            sizeBytes: 1000,
            fileId: "1".repeat(32) + "-480p"
          }],
          appliedWatermarkRevision: "b".repeat(32),
          processedAt: new Date().toISOString()
      }],
      video: null,
      watermark: { mode: "text", text: "Test", revision: "b".repeat(32), updatedAt: new Date().toISOString() }
    };
    atomicWriteJson(process.env.PORTFOLIO_CONTENT_PATH, initialPortfolio2);
    const time = Date.now() + globalTimeOffset++;
    fs.utimesSync(process.env.PORTFOLIO_CONTENT_PATH, time / 1000, time / 1000);

    const variantPath = path.join(process.env.PORTFOLIO_MEDIA_PATH, "global-v2", "photos", "33333333-3333-4333-8333-333333333333", "480p", "1".repeat(32) + "-480p.webp");
    fs.mkdirSync(path.dirname(variantPath), { recursive: true });
    fs.writeFileSync(variantPath, "fake-webp-content");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createLoaderArgs = (request: Request, params: LoaderFunctionArgs["params"]): LoaderFunctionArgs => ({
    request,
    url: new URL(request.url),
    pattern: "/admin/portfolio/media/:photoId/:variant",
    params,
    context: new RouterContextProvider(),
  });

  it("rejects access without session", async () => {
    const req = new Request("http://localhost/admin/portfolio/media/33333333-3333-4333-8333-333333333333/480p");
    const res = await mediaLoader(createLoaderArgs(req, { photoId: "a", variant: "b" }));
    expect((res as Response).status).toBe(401);
  });

  it("allows access with session", async () => {
    const session = await sessionServer.getSession("");
    session.set("adminId", "admin");
    const hmac = crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET || "A".repeat(32));
    hmac.update(process.env.ADMIN_PASSWORD_HASH || "$argon2id$v=19$m=65536,t=3,p=4$somehash$somehash");
    session.set("credentialVersion", hmac.digest("base64url").slice(0, 32));
    const cookie = await sessionServer.commitSession(session);

    const req = new Request("http://localhost/admin/portfolio/media/33333333-3333-4333-8333-333333333333/480p", {
      headers: { Cookie: cookie }
    });
    const res = await mediaLoader(createLoaderArgs(req, { photoId: "33333333-3333-4333-8333-333333333333", variant: "480p" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not expose hidden media publicly", async () => {
    const data = JSON.parse(fs.readFileSync(process.env.PORTFOLIO_CONTENT_PATH!, "utf-8"));
    data.photos[0].visible = false;
    atomicWriteJson(process.env.PORTFOLIO_CONTENT_PATH!, data);

    const request = new Request("http://localhost/portfolio/media/33333333-3333-4333-8333-333333333333/480p");
    const response = await publicMediaLoader(createLoaderArgs(request, {
      photoId: "33333333-3333-4333-8333-333333333333",
      variant: "480p",
    }));
    expect(response.status).toBe(404);
  });

  it("serves visible media with immutable public caching", async () => {
    const request = new Request("http://localhost/portfolio/media/33333333-3333-4333-8333-333333333333/480p");
    const response = await publicMediaLoader(createLoaderArgs(request, {
      photoId: "33333333-3333-4333-8333-333333333333",
      variant: "480p",
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    expect(await response.text()).toBe("fake-webp-content");
  });
});
