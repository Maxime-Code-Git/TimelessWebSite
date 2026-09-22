/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { action as coverAction } from "../app/routes/api.admin.portfolio-video-cover";
import { action as portfolioAction } from "../app/routes/admin.portfolio";
import { loader as publicLoader } from "../app/routes/portfolio.video-cover.$photoId.$variant.$ext";
import {
  getRawPortfolioContent,
  createDefaultPortfolioV2,
} from "../app/lib/portfolio-content.server";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-cover-test-"));
const mediaDir = path.join(tempDir, "media");
const dataDir = path.join(tempDir, "data");
fs.mkdirSync(mediaDir, { mode: 0o700 });
fs.mkdirSync(dataDir, { mode: 0o700 });

process.env.SITE_MEDIA_PATH = mediaDir;
process.env.PORTFOLIO_MEDIA_PATH = mediaDir;
process.env.MEDIA_BASE_PATH = mediaDir;
process.env.ADMIN_SESSION_SECRET = "test-secret";
process.env.PORTFOLIO_CONTENT_PATH = path.join(dataDir, "portfolio.json");

function resetJson() {
  // Build a valid schemaVersion 2 portfolio with a video
  const p = createDefaultPortfolioV2("00000000000000000000000000000000");
  (p as any).video = { provider: "youtube", videoId: "12345678901" };

  // Directly write to disk (bypasses revision check)
  fs.writeFileSync(process.env.PORTFOLIO_CONTENT_PATH!, JSON.stringify(p));

  // Also clean up any leftover media directories
  const globalDir = path.join(mediaDir, "global-v2");
  if (fs.existsSync(globalDir)) {
    fs.rmSync(globalDir, { recursive: true, force: true });
  }
}

// Mock session
vi.mock("../app/lib/admin-auth.server", () => {
  const fakeSession = { get: (key: string) => key === "csrfToken" ? "valid-csrf" : null };
  return {
    requireValidAdminSession: vi.fn().mockResolvedValue(fakeSession),
    requireSecureAdminMutation: vi.fn().mockImplementation(async (request: Request) => {
      return { session: fakeSession, safeRequest: request };
    }),
    validateAdminFormData: vi.fn().mockImplementation(async (request: Request) => {
      return request.formData();
    }),
    createAdminHeaders: vi.fn().mockReturnValue(new Headers()),
    ActionSecurityError: class ActionSecurityError extends Error {
      status: number;
      constructor(m: string, s: number) { super(m); this.status = s; }
    }
  };
});

vi.mock("../app/lib/security.server", () => ({
  validateOrigin: vi.fn().mockReturnValue(true),
}));

async function createTestImageFile(): Promise<Buffer> {
  return sharp({
    create: { width: 1000, height: 1000, channels: 3, background: { r: 128, g: 128, b: 128 } },
  }).png().toBuffer();
}

function createUploadRequest(
  imageBuffer: Buffer,
  revision: string,
  csrf = "valid-csrf",
  origin = "http://localhost:3000"
): Request {
  const boundary = "----TestBoundary" + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cover.png"\r\nContent-Type: image/png\r\n\r\n`),
    imageBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return new Request("http://localhost:3000/api/admin/portfolio-video-cover", {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "x-csrf-token": csrf,
      "x-portfolio-revision": revision,
      "Origin": origin,
    },
    body,
  });
}

describe("Portfolio Video Cover", () => {
  beforeEach(() => {
    resetJson();
    vi.clearAllMocks();
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should handle valid upload, store UUID in imageId and generate AVIF/WebP", async () => {
    const raw = getRawPortfolioContent();
    const buf = await createTestImageFile();
    const req = createUploadRequest(buf, raw.content.revision);
    const res = await coverAction({ request: req, params: {}, context: {} as any } as any);
    expect(res.status).toBe(200);
    const data = await res.json();

    // 1. imageId is a UUID
    expect(data.cover.imageId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );

    // 2. JSON on disk reflects the cover
    const updated = getRawPortfolioContent();
    expect(updated.content.video?.cover?.imageId).toBe(data.cover.imageId);

    // 3. project dir has variant subdirs
    const projectDir = path.join(mediaDir, "global-v2", "photos", data.cover.imageId);
    expect(fs.existsSync(projectDir)).toBe(true);
    const files = fs.readdirSync(projectDir);
    expect(files).toContain("480p");
    expect(files).toContain("960p");

    // 4. variants contain avif and webp files
    const dir480 = path.join(projectDir, "480p");
    const files480 = fs.readdirSync(dir480);
    expect(files480.length).toBeGreaterThan(0);
    expect(files480.some((f: string) => f.endsWith(".avif"))).toBe(true);
    expect(files480.some((f: string) => f.endsWith(".webp"))).toBe(true);
  });

  it("should serve WebP and AVIF successfully via public route", async () => {
    const raw = getRawPortfolioContent();
    const buf = await createTestImageFile();
    const req = createUploadRequest(buf, raw.content.revision);
    const res = await coverAction({ request: req, params: {}, context: {} as any } as any);
    expect(res.status).toBe(200);
    const cover = (await res.json()).cover;

    // 5. public WebP response
    const webpRes = await publicLoader({
      request: new Request(`http://localhost/portfolio/video-cover/${cover.imageId}/480p/webp`),
      params: { photoId: cover.imageId, variant: "480p", ext: "webp" },
      context: {} as any
    } as any);
    expect(webpRes.status).toBe(200);

    // 6. public AVIF response
    const avifRes = await publicLoader({
      request: new Request(`http://localhost/portfolio/video-cover/${cover.imageId}/480p/avif`),
      params: { photoId: cover.imageId, variant: "480p", ext: "avif" },
      context: {} as any
    } as any);
    expect(avifRes.status).toBe(200);

    // 7. unknown imageId → 404
    const badIdRes = await publicLoader({
      request: new Request(`http://localhost/portfolio/video-cover/00000000-0000-0000-0000-000000000000/480p/webp`),
      params: { photoId: "00000000-0000-0000-0000-000000000000", variant: "480p", ext: "webp" },
      context: {} as any
    } as any);
    expect(badIdRes.status).toBe(404);

    // 8. unsupported extension → 404
    const jpgRes = await publicLoader({
      request: new Request(`http://localhost/portfolio/video-cover/${cover.imageId}/480p/jpeg`),
      params: { photoId: cover.imageId, variant: "480p", ext: "jpeg" },
      context: {} as any
    } as any);
    expect(jpgRes.status).toBe(404);
  });

  it("should handle replacements and 404 old cover", async () => {
    let raw = getRawPortfolioContent();
    const buf = await createTestImageFile();

    // First upload
    const req1 = createUploadRequest(buf, raw.content.revision);
    const res1 = await coverAction({ request: req1, params: {}, context: {} as any } as any);
    expect(res1.status).toBe(200);
    const cover1 = (await res1.json()).cover;
    raw = getRawPortfolioContent();

    // 10. new cover serves 200
    const webpRes1 = await publicLoader({
      request: new Request(`http://localhost/portfolio/video-cover/${cover1.imageId}/480p/webp`),
      params: { photoId: cover1.imageId, variant: "480p", ext: "webp" },
      context: {} as any
    } as any);
    expect(webpRes1.status).toBe(200);

    // Second upload (replace)
    const req2 = createUploadRequest(buf, raw.content.revision);
    const res2 = await coverAction({ request: req2, params: {}, context: {} as any } as any);
    expect(res2.status).toBe(200);
    const cover2 = (await res2.json()).cover;

    // 9. old ID → 404
    const webpResOld = await publicLoader({
      request: new Request(`http://localhost/portfolio/video-cover/${cover1.imageId}/480p/webp`),
      params: { photoId: cover1.imageId, variant: "480p", ext: "webp" },
      context: {} as any
    } as any);
    expect(webpResOld.status).toBe(404);

    // new ID → 200
    const webpResNew = await publicLoader({
      request: new Request(`http://localhost/portfolio/video-cover/${cover2.imageId}/480p/webp`),
      params: { photoId: cover2.imageId, variant: "480p", ext: "webp" },
      context: {} as any
    } as any);
    expect(webpResNew.status).toBe(200);
  });

  it("should delete cover and preserve video", async () => {
    let raw = getRawPortfolioContent();
    const buf = await createTestImageFile();
    const req1 = createUploadRequest(buf, raw.content.revision);
    const res1 = await coverAction({ request: req1, params: {}, context: {} as any } as any);
    expect(res1.status).toBe(200);
    const cover1 = (await res1.json()).cover;
    raw = getRawPortfolioContent();

    // 11. delete cover
    const delReq = new Request("http://localhost:3000/api/admin/portfolio-video-cover", {
      method: "DELETE",
      headers: { "x-csrf-token": "valid-csrf", "x-portfolio-revision": raw.content.revision, "Origin": "http://localhost:3000" }
    });
    const delRes = await coverAction({ request: delReq, params: {}, context: {} as any } as any);
    expect(delRes.status).toBe(200);

    raw = getRawPortfolioContent();
    expect(raw.content.video?.cover).toBeUndefined();
    // Video itself is preserved with original videoId
    expect(raw.content.video?.videoId).toBe("12345678901");

    const webpResOld = await publicLoader({
      request: new Request(`http://localhost/portfolio/video-cover/${cover1.imageId}/480p/webp`),
      params: { photoId: cover1.imageId, variant: "480p", ext: "webp" },
      context: {} as any
    } as any);
    expect(webpResOld.status).toBe(404);
  });

  it("should delete cover when video is deleted", async () => {
    let raw = getRawPortfolioContent();
    const buf = await createTestImageFile();
    const req1 = createUploadRequest(buf, raw.content.revision);
    const res1 = await coverAction({ request: req1, params: {}, context: {} as any } as any);
    expect(res1.status).toBe(200);
    const cover1 = (await res1.json()).cover;
    raw = getRawPortfolioContent();

    // 12. delete video (via admin.portfolio)
    const formData = new FormData();
    formData.set("intent", "updateGlobalVideo");
    formData.set("revision", raw.content.revision);
    formData.set("videoUrl", ""); // Delete video
    const updateReq = new Request("http://localhost:3000/admin/portfolio", {
      method: "POST",
      body: formData,
      headers: { "Origin": "http://localhost:3000", "x-csrf-token": "valid-csrf" }
    });

    await portfolioAction({ request: updateReq, params: {}, context: {} as any } as any);

    raw = getRawPortfolioContent();
    expect(raw.content.video).toBeNull();

    expect(fs.existsSync(path.join(mediaDir, "global-v2", "photos", cover1.imageId))).toBe(false);
  });

  it("should preserve cover when changing video URL", async () => {
    let raw = getRawPortfolioContent();
    const buf = await createTestImageFile();
    const req1 = createUploadRequest(buf, raw.content.revision);
    const res1 = await coverAction({ request: req1, params: {}, context: {} as any } as any);
    expect(res1.status).toBe(200);
    const cover1 = (await res1.json()).cover;
    raw = getRawPortfolioContent();

    // 13. change URL
    const formData = new FormData();
    formData.set("intent", "updateGlobalVideo");
    formData.set("revision", raw.content.revision);
    formData.set("videoUrl", "https://youtube.com/watch?v=09876543210");
    const updateReq = new Request("http://localhost:3000/admin/portfolio", {
      method: "POST",
      body: formData,
      headers: { "Origin": "http://localhost:3000", "x-csrf-token": "valid-csrf" }
    });

    await portfolioAction({ request: updateReq, params: {}, context: {} as any } as any);

    raw = getRawPortfolioContent();
    expect(raw.content.video?.videoId).toBe("09876543210");
    expect(raw.content.video?.cover?.imageId).toBe(cover1.imageId);
    expect(fs.existsSync(path.join(mediaDir, "global-v2", "photos", cover1.imageId))).toBe(true);
  });

  it("should reject bad CSRF and origin", async () => {
    const raw = getRawPortfolioContent();
    const buf = await createTestImageFile();

    // 14. bad CSRF
    const req1 = createUploadRequest(buf, raw.content.revision, "bad-csrf", "http://localhost:3000");
    const res1 = await coverAction({ request: req1, params: {}, context: {} as any } as any);
    expect(res1.status).toBe(403);

    // bad Origin
    const req2 = createUploadRequest(buf, raw.content.revision, "valid-csrf", "http://bad-origin.com");
    // For this test, we mock validateOrigin to return false for this specific call
    const { validateOrigin } = await import("../app/lib/security.server");
    (validateOrigin as any).mockReturnValueOnce(false);
    const res2 = await coverAction({ request: req2, params: {}, context: {} as any } as any);
    expect(res2.status).toBe(403);
  });

  it("should rollback on JSON save failure", async () => {
    const raw = getRawPortfolioContent();
    const buf = await createTestImageFile();
    const req1 = createUploadRequest(buf, raw.content.revision);
    const res1 = await coverAction({ request: req1, params: {}, context: {} as any } as any);
    expect(res1.status).toBe(200);
    const cover1 = (await res1.json()).cover;

    // Try to replace with bad revision (JSON save will fail with 409)
    const req2 = createUploadRequest(buf, "00000000000000000000000000000000");
    const res2 = await coverAction({ request: req2, params: {}, context: {} as any } as any);
    expect(res2.status).toBe(409); // Conflict

    // 15. old cover still exists
    expect(fs.existsSync(path.join(mediaDir, "global-v2", "photos", cover1.imageId))).toBe(true);

    // 16. no orphan files (only the original cover folder)
    const photosDir = path.join(mediaDir, "global-v2", "photos");
    const dirs = fs.readdirSync(photosDir);
    expect(dirs.length).toBe(1);
    expect(dirs[0]).toBe(cover1.imageId);
  });
});
