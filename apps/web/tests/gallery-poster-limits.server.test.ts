import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Metadata } from "sharp";
import { action } from "../app/routes/api.admin.gallery.$id.media.$mediaId.poster";
import {
  MAX_POSTER_PIXELS,
  validatePosterMetadata,
} from "../app/lib/gallery-poster";
import { getGalleryDb } from "../app/lib/gallery-db.server";
import { requireValidAdminSession } from "../app/lib/admin-auth.server";
import sharp from "sharp";

vi.mock("../app/lib/gallery-db.server", () => ({
  getGalleryDb: vi.fn(),
}));

vi.mock("../app/lib/admin-auth.server", () => ({
  requireValidAdminSession: vi.fn(),
  createAdminHeaders: vi.fn(() => new Headers()),
}));

vi.mock("../app/lib/security.server", () => ({
  validateOrigin: vi.fn(() => true),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    chmodSync: vi.fn(),
    createWriteStream: vi.fn(() => ({
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(function(this: unknown, event: string, cb: () => void) {
        if (event === "finish") cb();
        return this;
      }),
      once: vi.fn(function(this: unknown, event: string, cb: () => void) {
        if (event === "finish") cb();
        return this;
      }),
      destroy: vi.fn(),
    })),
  };
});

vi.mock("sharp", () => {
  const mockSharp = {
    rotate: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    avif: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue(true),
    metadata: vi.fn(),
  };
  return { default: vi.fn(() => mockSharp) };
});

describe("Gallery Poster Limits & 42.2 Megapixels Acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a 7952 x 5304 (42,176,448 pixels) JPEG photo", () => {
    const meta = {
      format: "jpeg",
      width: 7952,
      height: 5304,
    } as unknown as Metadata;

    const result = validatePosterMetadata(meta);
    expect(result.valid).toBe(true);
  });

  it("rejects an image exceeding 20,000 pixels in width or height", () => {
    const wideMeta = {
      format: "jpeg",
      width: 20001,
      height: 1000,
    } as unknown as Metadata;

    const result = validatePosterMetadata(wideMeta);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.status).toBe(413);
      expect(result.message).toContain("20\u202F000 pixels");
    }
  });

  it("rejects an image exceeding 120,000,000 pixels", () => {
    const hugeMeta = {
      format: "jpeg",
      width: 15000,
      height: 9000, // 135 MP
    } as unknown as Metadata;

    const result = validatePosterMetadata(hugeMeta);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.status).toBe(413);
      expect(result.message).toContain("120 millions de pixels");
    }
  });

  it("rejects unsupported format", () => {
    const gifMeta = {
      format: "gif",
      width: 800,
      height: 600,
    } as unknown as Metadata;

    const result = validatePosterMetadata(gifMeta);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.status).toBe(415);
    }
  });

  it("preserves the existing poster in DB when uploaded file exceeds dimensions", async () => {
    const mockDb = {
      prepare: vi.fn().mockReturnThis(),
      get: vi.fn(() => ({ id: "med1", type: "video", poster_revision: "initial-poster-rev" })),
      run: vi.fn(),
      exec: vi.fn(),
    };
    vi.mocked(getGalleryDb).mockReturnValue(mockDb as unknown as ReturnType<typeof getGalleryDb>);
    vi.mocked(requireValidAdminSession).mockResolvedValue({ get: () => "valid-csrf" } as unknown as Awaited<ReturnType<typeof requireValidAdminSession>>);

    const sharpInstance = {
      rotate: vi.fn().mockReturnThis(),
      resize: vi.fn().mockReturnThis(),
      avif: vi.fn().mockReturnThis(),
      webp: vi.fn().mockReturnThis(),
      toFile: vi.fn().mockResolvedValue(true),
      metadata: vi.fn().mockResolvedValue({
        format: "jpeg",
        width: 21000,
        height: 5000,
      }),
    };
    vi.mocked(sharp).mockReturnValue(sharpInstance as unknown as ReturnType<typeof sharp>);

    const boundary = "----WebKitFormBoundaryTest";
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="csrfToken"`,
      ``,
      `valid-csrf`,
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="huge.jpg"`,
      `Content-Type: image/jpeg`,
      ``,
      `fake-jpeg-content`,
      `--${boundary}--`,
      ``
    ].join("\r\n");

    const req = new Request("http://localhost/api", {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": Buffer.byteLength(body).toString(),
      },
      body: Buffer.from(body),
    });

    const res = await action({
      request: req,
      params: { id: "gal1", mediaId: "med1" },
      context: {},
    } as unknown as Parameters<typeof action>[0]) as Response;

    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toContain("20\u202F000 pixels");

    // Verify DB update was NOT called
    expect(mockDb.prepare).not.toHaveBeenCalledWith("UPDATE gallery_media SET poster_revision = ? WHERE id = ?");
    expect(mockDb.exec).not.toHaveBeenCalledWith("COMMIT");

    // Verify sharp was called with limitInputPixels: MAX_POSTER_PIXELS and never disabled
    expect(sharp).toHaveBeenCalledWith(expect.any(String), { limitInputPixels: MAX_POSTER_PIXELS });
  });
});
