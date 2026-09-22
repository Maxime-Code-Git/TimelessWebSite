import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "../app/routes/api.admin.gallery.$id.media.$mediaId.poster";
import { fsSync } from "../app/lib/fs.server";
import { getGalleryDb } from "../app/lib/gallery-db.server";
import { requireValidAdminSession } from "../app/lib/admin-auth.server";
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
  const actual = (await importOriginal()) as typeof import("node:fs");
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
        on: vi.fn(function(this: unknown, event: string, cb: () => void) {
          if (event === "finish") cb();
          return this;
        }),
        once: vi.fn(function(this: unknown, event: string, cb: () => void) {
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

interface MockDb {
  prepare: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
}

describe("Poster API - FS Mock Tests", () => {
  let mockDb: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      get: vi.fn(() => ({ id: "test-media", type: "video", poster_revision: "rev1" })),
      run: vi.fn(),
      exec: vi.fn(),
    };
    vi.mocked(getGalleryDb).mockReturnValue(mockDb as unknown as ReturnType<typeof getGalleryDb>);
    vi.mocked(requireValidAdminSession).mockResolvedValue({ get: () => "valid-csrf" } as unknown as Awaited<ReturnType<typeof requireValidAdminSession>>);
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

  function getActionArgs(request: Request): Parameters<typeof action>[0] {
    return {
      request,
      params: { id: "gal1", mediaId: "med1" },
      context: {}
    } as unknown as Parameters<typeof action>[0];
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

    const unlinkSpy = vi.spyOn(fs, "unlinkSync");
    unlinkSpy.mockImplementation(() => {});

    const response = await action(getActionArgs(mockRequest)) as Response;

    expect(response.status).toBe(500);
    expect(mockDb.exec).toHaveBeenCalledWith("ROLLBACK");
    expect(mockDb.exec).not.toHaveBeenCalledWith("COMMIT");
    expect(mockDb.prepare).not.toHaveBeenCalledWith("UPDATE gallery_media SET poster_revision = ? WHERE id = ?");

    // Check if new avif was deleted
    expect(unlinkSpy).toHaveBeenCalled();
    // It shouldn't have cleaned up old revisions since it failed mid-way
    const rmSpy = vi.spyOn(fsSync, "rmSync");
    expect(rmSpy).not.toHaveBeenCalled();
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

    const response = await action(getActionArgs(mockRequest)) as Response;

    expect(response.status).toBe(200);
    expect(mockDb.exec).toHaveBeenCalledWith("COMMIT");
    expect(mockDb.exec).not.toHaveBeenCalledWith("ROLLBACK");
    expect(mockDb.prepare).toHaveBeenCalledWith("UPDATE gallery_media SET poster_revision = NULL WHERE id = ?");

    // Initial move to quarantine should be called
    expect(renameSpy).toHaveBeenCalledTimes(1);
    // No second renameSync for restoration
    expect(renameSpy).not.toHaveBeenCalledTimes(2);
  });

  describe("Invalid Content-Length tests", () => {
    const runLengthTest = async (lengthStr: string) => {
      const boundary = "----WebKitFormBoundaryDummy";
      const bodyBuffer = Buffer.from(buildMultipart(boundary));

      const mockRequest = new Request("http://localhost/api", {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": lengthStr
        },
        body: bodyBuffer
      });

      const response = await action(getActionArgs(mockRequest)) as Response;
      expect(response.status).toBe(400);
    };

    it("should return 400 for decimal Content-Length", () => runLengthTest("123.45"));
    it("should return 400 for negative Content-Length", () => runLengthTest("-100"));
    it("should return 400 for non-numeric Content-Length", () => runLengthTest("12abc"));
    it("should return 400 for too large Content-Length", () => runLengthTest((Number.MAX_SAFE_INTEGER + 1).toString()));
  });
});
