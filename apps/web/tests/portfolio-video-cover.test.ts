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
  savePortfolio,
} from "../app/lib/portfolio-content.server";
import { validateOrigin } from "../app/lib/security.server";

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
  const p = createDefaultPortfolioV2("00000000000000000000000000000000");
  if (p.video === null) {
    p.video = { provider: "youtube", videoId: "12345678901", cover: undefined };
  } else {
    p.video.provider = "youtube";
    p.video.videoId = "12345678901";
  }

  fs.writeFileSync(process.env.PORTFOLIO_CONTENT_PATH!, JSON.stringify(p));

  const globalDir = path.join(mediaDir, "global-v2");
  if (fs.existsSync(globalDir)) {
    fs.rmSync(globalDir, { recursive: true, force: true });
  }
}

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

vi.mock("../app/lib/portfolio-content.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/lib/portfolio-content.server")>();
  return {
    ...actual,
    savePortfolio: vi.fn((...args: Parameters<typeof actual.savePortfolio>) => actual.savePortfolio(...args)),
  };
});

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

function createActionContext(req: Request): Parameters<typeof coverAction>[0] {
  return { request: req, params: {} } as unknown as Parameters<typeof coverAction>[0];
}
function createLoaderContext(req: Request, params: Record<string, string>): Parameters<typeof publicLoader>[0] {
  return { request: req, params } as unknown as Parameters<typeof publicLoader>[0];
}

interface CoverResponse {
  success: boolean;
  newRevision: string;
  cover?: {
    imageId: string;
    variants: Array<{ name: string; width: number; height: number; fileId: string }>;
    width: number;
    height: number;
  };
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
    const res = await coverAction(createActionContext(req));
    expect(res.status).toBe(200);
    const data = (await res.json()) as CoverResponse;

    expect(data.cover?.imageId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );

    const updated = getRawPortfolioContent();
    expect(updated.content.video?.cover?.imageId).toBe(data.cover?.imageId);

    const projectDir = path.join(mediaDir, "global-v2", "photos", data.cover!.imageId);
    expect(fs.existsSync(projectDir)).toBe(true);
    const files = fs.readdirSync(projectDir);
    expect(files).toContain("480p");
    expect(files).toContain("960p");

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
    const res = await coverAction(createActionContext(req));
    expect(res.status).toBe(200);
    const data = (await res.json()) as CoverResponse;
    const cover = data.cover!;

    // GET WebP
    const webpRes = await publicLoader(createLoaderContext(
      new Request(`http://localhost/portfolio/video-cover/${cover.imageId}/480p/webp`),
      { photoId: cover.imageId, variant: "480p", ext: "webp" }
    ));
    expect(webpRes.status).toBe(200);
    expect(webpRes.headers.get("Content-Type")).toBe("image/webp");

    // HEAD WebP
    const webpHeadRes = await publicLoader(createLoaderContext(
      new Request(`http://localhost/portfolio/video-cover/${cover.imageId}/480p/webp`, { method: "HEAD" }),
      { photoId: cover.imageId, variant: "480p", ext: "webp" }
    ));
    expect(webpHeadRes.status).toBe(200);
    expect(webpHeadRes.headers.get("Content-Type")).toBe("image/webp");
    expect(await webpHeadRes.text()).toBe(""); // No body

    // GET AVIF
    const avifRes = await publicLoader(createLoaderContext(
      new Request(`http://localhost/portfolio/video-cover/${cover.imageId}/480p/avif`),
      { photoId: cover.imageId, variant: "480p", ext: "avif" }
    ));
    expect(avifRes.status).toBe(200);
    expect(avifRes.headers.get("Content-Type")).toBe("image/avif");

    // HEAD AVIF
    const avifHeadRes = await publicLoader(createLoaderContext(
      new Request(`http://localhost/portfolio/video-cover/${cover.imageId}/480p/avif`, { method: "HEAD" }),
      { photoId: cover.imageId, variant: "480p", ext: "avif" }
    ));
    expect(avifHeadRes.status).toBe(200);
    expect(avifHeadRes.headers.get("Content-Type")).toBe("image/avif");
    expect(await avifHeadRes.text()).toBe(""); // No body
  });

  it("should handle replacements and 404 old cover", async () => {
    let raw = getRawPortfolioContent();
    const buf = await createTestImageFile();

    const req1 = createUploadRequest(buf, raw.content.revision);
    const res1 = await coverAction(createActionContext(req1));
    expect(res1.status).toBe(200);
    const cover1 = ((await res1.json()) as CoverResponse).cover!;
    raw = getRawPortfolioContent();

    const webpRes1 = await publicLoader(createLoaderContext(
      new Request(`http://localhost/portfolio/video-cover/${cover1.imageId}/480p/webp`),
      { photoId: cover1.imageId, variant: "480p", ext: "webp" }
    ));
    expect(webpRes1.status).toBe(200);

    const req2 = createUploadRequest(buf, raw.content.revision);
    const res2 = await coverAction(createActionContext(req2));
    expect(res2.status).toBe(200);
    const cover2 = ((await res2.json()) as CoverResponse).cover!;

    const webpResOld = await publicLoader(createLoaderContext(
      new Request(`http://localhost/portfolio/video-cover/${cover1.imageId}/480p/webp`),
      { photoId: cover1.imageId, variant: "480p", ext: "webp" }
    ));
    expect(webpResOld.status).toBe(404);

    const webpResNew = await publicLoader(createLoaderContext(
      new Request(`http://localhost/portfolio/video-cover/${cover2.imageId}/480p/webp`),
      { photoId: cover2.imageId, variant: "480p", ext: "webp" }
    ));
    expect(webpResNew.status).toBe(200);
  });

  it("should delete cover and preserve video", async () => {
    let raw = getRawPortfolioContent();
    const buf = await createTestImageFile();
    const req1 = createUploadRequest(buf, raw.content.revision);
    const res1 = await coverAction(createActionContext(req1));
    expect(res1.status).toBe(200);
    const cover1 = ((await res1.json()) as CoverResponse).cover!;
    raw = getRawPortfolioContent();

    const delReq = new Request("http://localhost:3000/api/admin/portfolio-video-cover", {
      method: "DELETE",
      headers: { "x-csrf-token": "valid-csrf", "x-portfolio-revision": raw.content.revision, "Origin": "http://localhost:3000" }
    });
    const delRes = await coverAction(createActionContext(delReq));
    expect(delRes.status).toBe(200);

    raw = getRawPortfolioContent();
    expect(raw.content.video?.cover).toBeUndefined();
    expect(raw.content.video?.videoId).toBe("12345678901");

    const webpResOld = await publicLoader(createLoaderContext(
      new Request(`http://localhost/portfolio/video-cover/${cover1.imageId}/480p/webp`),
      { photoId: cover1.imageId, variant: "480p", ext: "webp" }
    ));
    expect(webpResOld.status).toBe(404);
  });

  it("should delete cover when video is deleted", async () => {
    let raw = getRawPortfolioContent();
    const buf = await createTestImageFile();
    const req1 = createUploadRequest(buf, raw.content.revision);
    const res1 = await coverAction(createActionContext(req1));
    expect(res1.status).toBe(200);
    const cover1 = ((await res1.json()) as CoverResponse).cover!;
    raw = getRawPortfolioContent();

    const formData = new FormData();
    formData.set("intent", "updateGlobalVideo");
    formData.set("revision", raw.content.revision);
    formData.set("videoUrl", "");
    const updateReq = new Request("http://localhost:3000/admin/portfolio", {
      method: "POST",
      body: formData,
      headers: { "Origin": "http://localhost:3000", "x-csrf-token": "valid-csrf" }
    });

    await portfolioAction(createActionContext(updateReq));

    raw = getRawPortfolioContent();
    expect(raw.content.video).toBeNull();
    expect(fs.existsSync(path.join(mediaDir, "global-v2", "photos", cover1.imageId))).toBe(false);
  });

  it("should preserve cover when changing video URL", async () => {
    let raw = getRawPortfolioContent();
    const buf = await createTestImageFile();
    const req1 = createUploadRequest(buf, raw.content.revision);
    const res1 = await coverAction(createActionContext(req1));
    expect(res1.status).toBe(200);
    const cover1 = ((await res1.json()) as CoverResponse).cover!;
    raw = getRawPortfolioContent();

    const formData = new FormData();
    formData.set("intent", "updateGlobalVideo");
    formData.set("revision", raw.content.revision);
    formData.set("videoUrl", "https://youtube.com/watch?v=09876543210");
    const updateReq = new Request("http://localhost:3000/admin/portfolio", {
      method: "POST",
      body: formData,
      headers: { "Origin": "http://localhost:3000", "x-csrf-token": "valid-csrf" }
    });

    await portfolioAction(createActionContext(updateReq));

    raw = getRawPortfolioContent();
    expect(raw.content.video?.videoId).toBe("09876543210");
    expect(raw.content.video?.cover?.imageId).toBe(cover1.imageId);
    expect(fs.existsSync(path.join(mediaDir, "global-v2", "photos", cover1.imageId))).toBe(true);
  });

  it("should reject bad CSRF and origin", async () => {
    const raw = getRawPortfolioContent();
    const buf = await createTestImageFile();

    const req1 = createUploadRequest(buf, raw.content.revision, "bad-csrf", "http://localhost:3000");
    const res1 = await coverAction(createActionContext(req1));
    expect(res1.status).toBe(403);

    const req2 = createUploadRequest(buf, raw.content.revision, "valid-csrf", "http://bad-origin.com");
    vi.mocked(validateOrigin).mockReturnValueOnce(false);
    const res2 = await coverAction(createActionContext(req2));
    expect(res2.status).toBe(403);
  });

  it("should reject bad revision and NOT leak internal error details", async () => {
    const buf = await createTestImageFile();
    const req = createUploadRequest(buf, "11111111111111111111111111111111");
    const res = await coverAction(createActionContext(req));
    expect(res.status).toBe(409); 
    const resJson = await res.json() as { error: string };
    expect(resJson.error).toBe("Revision conflict"); // Expected, valid error

    // Let's force an unexpected error to check 500 response
    vi.mocked(savePortfolio).mockImplementationOnce(() => {
      throw new Error("Some internal database crash");
    });
    const raw = getRawPortfolioContent();
    const req3 = createUploadRequest(buf, raw.content.revision);
    const res3 = await coverAction(createActionContext(req3));
    expect(res3.status).toBe(500);
    const resJson3 = await res3.json() as { error: string };
    expect(resJson3.error).toBe("Internal Server Error");
    expect(resJson3.error).not.toContain("internal database crash");
    expect(resJson3.error).not.toContain("Error:");
  });

  it("should rollback when savePortfolio fails", async () => {
    let raw = getRawPortfolioContent();
    const buf = await createTestImageFile();
    const req1 = createUploadRequest(buf, raw.content.revision);
    const res1 = await coverAction(createActionContext(req1));
    expect(res1.status).toBe(200);
    const cover1 = ((await res1.json()) as CoverResponse).cover!;
    raw = getRawPortfolioContent();

    vi.mocked(savePortfolio).mockImplementationOnce(() => {
      throw new Error("Forced save failure");
    });

    const req2 = createUploadRequest(buf, raw.content.revision);
    const res2 = await coverAction(createActionContext(req2));
    expect(res2.status).toBe(500); // Because it's an unexpected error
    
    // JSON is unchanged (old cover)
    const afterRaw = getRawPortfolioContent();
    expect(afterRaw.content.video?.cover?.imageId).toBe(cover1.imageId);

    // Old cover files are restored
    expect(fs.existsSync(path.join(mediaDir, "global-v2", "photos", cover1.imageId))).toBe(true);
    
    // New cover was removed or didn't leak, only 1 cover dir exists
    const photosDir = path.join(mediaDir, "global-v2", "photos");
    const dirs = fs.readdirSync(photosDir);
    expect(dirs.length).toBe(1);
    expect(dirs[0]).toBe(cover1.imageId);
  });

  it("should handle commit failure gracefully without breaking state", async () => {
    let raw = getRawPortfolioContent();
    const buf = await createTestImageFile();
    const req1 = createUploadRequest(buf, raw.content.revision);
    const res1 = await coverAction(createActionContext(req1));
    expect(res1.status).toBe(200);
    const cover1 = ((await res1.json()) as CoverResponse).cover!;
    raw = getRawPortfolioContent();

    // Force rmSync to fail, simulating a failure during the commit (quarantine cleanup)
    const originalRmSync = fs.rmSync;
    vi.spyOn(fs, "rmSync").mockImplementation((p, options) => {
      if (typeof p === "string" && p.includes("video-cover-")) {
        throw new Error("Forced cleanup failure");
      }
      return originalRmSync(p, options);
    });

    const req2 = createUploadRequest(buf, raw.content.revision);
    const res2 = await coverAction(createActionContext(req2));
    expect(res2.status).toBe(200); // Must still be successful
    const cover2 = ((await res2.json()) as CoverResponse).cover!;

    const afterRaw = getRawPortfolioContent();
    expect(afterRaw.content.video?.cover?.imageId).toBe(cover2.imageId);

    // New cover responds 200
    const webpResNew = await publicLoader(createLoaderContext(
      new Request(`http://localhost/portfolio/video-cover/${cover2.imageId}/480p/webp`),
      { photoId: cover2.imageId, variant: "480p", ext: "webp" }
    ));
    expect(webpResNew.status).toBe(200);

    // Old cover responds 404 (because we read from JSON first)
    const webpResOld = await publicLoader(createLoaderContext(
      new Request(`http://localhost/portfolio/video-cover/${cover1.imageId}/480p/webp`),
      { photoId: cover1.imageId, variant: "480p", ext: "webp" }
    ));
    expect(webpResOld.status).toBe(404);
  });

  it("should fail gracefully and rollback when renameSync fails during prepare", async () => {
    let raw = getRawPortfolioContent();
    const buf = await createTestImageFile();
    const req1 = createUploadRequest(buf, raw.content.revision);
    const res1 = await coverAction(createActionContext(req1));
    expect(res1.status).toBe(200);
    const cover1 = ((await res1.json()) as CoverResponse).cover!;
    raw = getRawPortfolioContent();

    const originalRenameSync = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((oldPath, newPath) => {
      if (typeof newPath === "string" && newPath.includes("video-cover-")) {
        throw new Error("Forced rename failure");
      }
      return originalRenameSync(oldPath, newPath);
    });

    const req2 = createUploadRequest(buf, raw.content.revision);
    const res2 = await coverAction(createActionContext(req2));
    expect(res2.status).toBe(500); // 500 Generic Error

    const resJson = await res2.json() as { error: string };
    expect(resJson.error).toBe("Internal Server Error");

    const afterRaw = getRawPortfolioContent();
    expect(afterRaw.content.video?.cover?.imageId).toBe(cover1.imageId);

    expect(fs.existsSync(path.join(mediaDir, "global-v2", "photos", cover1.imageId))).toBe(true);
    
    // Validate that new cover files were cleaned up
    const photosDir = path.join(mediaDir, "global-v2", "photos");
    const dirs = fs.readdirSync(photosDir);
    expect(dirs.length).toBe(1);
    expect(dirs[0]).toBe(cover1.imageId);
  });
});
