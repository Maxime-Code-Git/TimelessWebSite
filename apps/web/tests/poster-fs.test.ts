/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "../app/routes/api.admin.gallery.$id.media.$mediaId.poster";
import { fsSync } from "../app/lib/fs.server";
import { getGalleryDb } from "../app/lib/gallery-db.server";
import { requireValidAdminSession } from "../app/lib/admin-auth.server";
import { validateOrigin } from "../app/lib/security.server";
import fs from "node:fs";

vi.mock("../app/lib/fs.server", () => ({
  fsSync: {
    renameSync: vi.fn(),
    rmSync: vi.fn(),
  }
}));

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
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    chmodSync: vi.fn(),
    createWriteStream: vi.fn(() => {
      return {
        write: vi.fn(),
        end: vi.fn(),
        on: vi.fn((event, cb) => {
          if (event === "finish") cb();
          return this;
        }),
        once: vi.fn((event, cb) => {
          if (event === "finish") cb();
          return this;
        }),
        destroy: vi.fn(),
      };
    }),
  };
});

vi.mock("sharp", () => {
  const mockSharp = {
    rotate: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    avif: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue(true),
    metadata: vi.fn().mockResolvedValue({ width: 100, height: 100, format: "jpeg" }),
  };
  return { default: vi.fn(() => mockSharp) };
});

describe("Poster API - FS Mock Tests", () => {
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      get: vi.fn(() => ({ id: "test-media", type: "video", poster_revision: "rev1" })),
      run: vi.fn(),
      exec: vi.fn(),
    };
    (getGalleryDb as any).mockReturnValue(mockDb);
    (requireValidAdminSession as any).mockResolvedValue({ get: () => "valid-csrf" });
  });

  function buildMultipart(boundary: string) {
    const parts = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="csrfToken"`,
      ``,
      `valid-csrf`,
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="test.jpg"`,
      `Content-Type: image/jpeg`,
      ``,
      `fake-image-data`,
      `--${boundary}--`,
      ``
    ];
    return parts.join("\r\n");
  }

  it("should return 500 and rollback when second renameSync fails", async () => {
    const boundary = "----WebKitFormBoundaryDummy";
    const bodyString = buildMultipart(boundary);
    const bodyBuffer = Buffer.from(bodyString);

    const mockRequest = new Request("http://localhost/api", {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": bodyBuffer.length.toString()
      },
      body: bodyBuffer
    });

    const renameSpy = vi.spyOn(fsSync, "renameSync");
    renameSpy.mockImplementationOnce(() => {}); // AVIF rename succeeds
    renameSpy.mockImplementationOnce(() => { throw new Error("Second rename failed"); }); // WEBP rename fails

    console.log("CT:", mockRequest.headers.get("Content-Type"));
    const response = await action({
      request: mockRequest,
      params: { id: "gal1", mediaId: "med1" },
      context: {} as any
    } as any) as Response;

    expect(response.status).toBe(500);
    expect(mockDb.exec).toHaveBeenCalledWith("ROLLBACK");
    // expect(fs.unlinkSync).toHaveBeenCalled(); // Should attempt to remove avif
  });

  it("should return 200 and not rollback if rmSync fails during quarantine cleanup", async () => {
    const mockRequest = new Request("http://localhost/api", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ intent: "delete_poster", csrfToken: "valid-csrf" })
    });

    const renameSpy = vi.spyOn(fsSync, "renameSync");
    renameSpy.mockImplementation(() => {}); // quarantine rename succeeds

    const rmSpy = vi.spyOn(fsSync, "rmSync");
    rmSpy.mockImplementation(() => { throw new Error("rmSync failed"); });

    const response = await action({
      request: mockRequest,
      params: { id: "gal1", mediaId: "med1" },
      context: {} as any
    } as any) as Response;

    expect(response.status).toBe(200);
    expect(mockDb.exec).toHaveBeenCalledWith("COMMIT");
    // Should still update DB
    expect(mockDb.prepare).toHaveBeenCalledWith("UPDATE gallery_media SET poster_revision = NULL WHERE id = ?");
  });
});
