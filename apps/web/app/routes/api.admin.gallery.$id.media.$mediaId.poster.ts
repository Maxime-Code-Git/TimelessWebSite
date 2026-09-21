import { type ActionFunctionArgs } from "react-router";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import busboy from "busboy";
import sharp from "sharp";
import { requireValidAdminSession } from "../lib/admin-auth.server";
import { validateOrigin } from "../lib/security.server";
import { getGalleryDb } from "../lib/gallery-db.server";
import { ENV } from "../lib/env.server";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

class UploadRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "UploadRequestError";
  }
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function parseSingleUpload(
  request: Request,
  contentType: string,
  tempDirectory: string
): Promise<string> {
  if (!request.body) throw new UploadRequestError("Upload body is missing.", 400);

  const reader = request.body.getReader();
  let activeWriteStream: fs.WriteStream | null = null;
  let fileWritePromise: Promise<void> | null = null;
  let uploadedFilePath: string | null = null;
  let fileCount = 0;
  let settled = false;
  let resolveParser!: () => void;
  let rejectParser!: (error: Error) => void;

  const parserDone = new Promise<void>((resolve, reject) => {
    resolveParser = resolve;
    rejectParser = reject;
  });
  void parserDone.catch(() => undefined);

  const parser = busboy({
    headers: { "content-type": contentType },
    limits: {
      files: 1,
      fields: 0,
      parts: 2,
      fileSize: MAX_FILE_SIZE,
    },
  });

  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    activeWriteStream?.destroy();
    rejectParser(error);
  };

  const stopActiveWrite = () => activeWriteStream?.destroy();
  const waitForFileWrite = async () => {
    if (fileWritePromise) await fileWritePromise.catch(() => undefined);
  };

  parser.on("file", (fieldName, file, info) => {
    fileCount += 1;
    if (fieldName !== "file" || fileCount !== 1) {
      file.resume();
      fail(new UploadRequestError("The upload must contain exactly one file.", 400));
      return;
    }
    if (!allowedMimeTypes.has(info.mimeType)) {
      file.resume();
      fail(new UploadRequestError("Unsupported image type.", 415));
      return;
    }

    const tempPath = path.join(tempDirectory, crypto.randomUUID());
    activeWriteStream = fs.createWriteStream(tempPath, {
      flags: "wx",
      mode: 0o600,
    });

    file.on("limit", () => {
      fail(new UploadRequestError("File too large.", 413));
    });
    file.on("error", () => {
      fail(new UploadRequestError("Upload stream failed.", 400));
    });
    activeWriteStream.on("error", () => {
      fail(new UploadRequestError("Upload storage failed.", 500));
    });

    const currentWriteStream = activeWriteStream;
    fileWritePromise = finished(currentWriteStream).then(() => {
      uploadedFilePath = tempPath;
      activeWriteStream = null;
    });
    void fileWritePromise.catch(error => {
      fail(error instanceof UploadRequestError
        ? error
        : new UploadRequestError("Upload storage failed.", 500));
    });
    file.pipe(currentWriteStream);
  });

  parser.on("partsLimit", () => fail(new UploadRequestError("Too many upload parts.", 400)));
  parser.on("filesLimit", () => fail(new UploadRequestError("Too many files.", 400)));
  parser.on("fieldsLimit", () => fail(new UploadRequestError("Unexpected form fields.", 400)));
  parser.on("error", () => fail(new UploadRequestError("Invalid multipart body.", 400)));
  parser.on("close", () => {
    void (async () => {
      try {
        if (fileWritePromise) await fileWritePromise;
        if (fileCount !== 1 || !uploadedFilePath) {
          throw new UploadRequestError("The upload must contain exactly one file.", 400);
        }
        if (!settled) {
          settled = true;
          resolveParser();
        }
      } catch (error: unknown) {
        fail(error instanceof Error
          ? error
          : new UploadRequestError("Upload failed.", 400));
      }
    })();
  });

  try {
    while (!settled) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!parser.write(Buffer.from(value))) {
        await Promise.race([once(parser, "drain"), parserDone]);
      }
    }
    if (!settled) parser.end();
    await parserDone;
    return uploadedFilePath!;
  } catch (error: unknown) {
    await reader.cancel().catch(() => undefined);
    parser.destroy();
    stopActiveWrite();
    await waitForFileWrite();
    await parserDone.catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  const session = await requireValidAdminSession(request);
  if (!validateOrigin(request)) return jsonError("Forbidden", 403);

  const galleryId = params.id;
  const mediaId = params.mediaId;
  if (!galleryId || !mediaId) return jsonError("Missing parameters", 400);

  const db = getGalleryDb();

  // Verify gallery exists
  const gallery = db.prepare("SELECT id FROM galleries WHERE id = ?").get(galleryId);
  if (!gallery) return jsonError("Gallery not found", 404);

  // Verify media exists and is a video
  const media = db.prepare("SELECT type, poster_revision FROM gallery_media WHERE id = ? AND gallery_id = ?").get(mediaId, galleryId) as { type: string, poster_revision: string | null } | undefined;
  if (!media) return jsonError("Media not found", 404);
  if (media.type !== "video") return jsonError("Media is not a video", 400);

  const contentType = request.headers.get("Content-Type") ?? "";

  const isFormUrlEncoded = contentType.includes("application/x-www-form-urlencoded");

  if (isFormUrlEncoded) {
    // Delete poster logic
    const formData = await request.formData();
    const csrfToken = formData.get("csrfToken");
    if (!csrfToken || csrfToken !== session.get("csrfToken")) {
      return jsonError("Forbidden", 403);
    }

    const intent = formData.get("intent");
    if (intent !== "delete_poster") {
      return jsonError("Invalid intent", 400);
    }

    if (!media.poster_revision) {
      return jsonError("Poster not found", 404);
    }

    const postersDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId, ".posters", mediaId);
    const quarantineDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId, ".quarantine", mediaId + "_poster_" + crypto.randomUUID());

    let quarantined = false;
    try {
      if (fs.existsSync(postersDir)) {
        fs.mkdirSync(path.dirname(quarantineDir), { recursive: true });
        fs.renameSync(postersDir, quarantineDir);
        quarantined = true;
      }

      db.exec("BEGIN TRANSACTION");
      try {
        db.prepare("UPDATE gallery_media SET poster_revision = NULL WHERE id = ?").run(mediaId);
        db.exec("COMMIT");
      } catch (dbErr) {
        db.exec("ROLLBACK");
        throw dbErr;
      }

      // Cleanup quarantine
      if (quarantined) {
        fs.rmSync(quarantineDir, { recursive: true, force: true });
      }

      return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      // Rollback file move
      if (quarantined) {
        try { fs.renameSync(quarantineDir, postersDir); } catch { /* best effort */ }
      }
      return jsonError("Failed to delete poster", 500);
    }
  }

  // Upload/Replace logic
  const url = new URL(request.url);
  const csrfTokenHeader = request.headers.get("x-csrf-token") || url.searchParams.get("csrfToken");
  if (!csrfTokenHeader || csrfTokenHeader !== session.get("csrfToken")) {
    return jsonError("Forbidden", 403);
  }

  if (!/^multipart\/form-data\s*;[^\r\n]*boundary=/i.test(contentType)) {
    return jsonError("Unsupported Media Type", 415);
  }

  const contentLength = parseInt(request.headers.get("Content-Length") ?? "0", 10);
  if (contentLength > MAX_FILE_SIZE) {
    return jsonError("File too large", 413);
  }

  let tempDirectory: string | null = null;
  try {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-gallery-poster-"));
    fs.chmodSync(tempDirectory, 0o700);

    const uploadedFilePath = await parseSingleUpload(request, contentType, tempDirectory);

    // Validate real content with sharp
    const metadata = await sharp(uploadedFilePath).metadata();
    if (!metadata.format || !["jpeg", "png", "webp", "avif"].includes(metadata.format)) {
      return jsonError("Invalid image content", 415);
    }
    if ((metadata.width || 0) * (metadata.height || 0) > 40_000_000) {
      return jsonError("Image too large (dimensions)", 413);
    }

    const newRevision = crypto.randomUUID();
    const tempAvifPath = path.join(tempDirectory, newRevision + ".avif");
    const tempWebpPath = path.join(tempDirectory, newRevision + ".webp");

    await sharp(uploadedFilePath)
      .rotate() // Apply EXIF rotation
      .resize({ width: 1920, withoutEnlargement: true })
      .avif({ effort: 6 })
      .toFile(tempAvifPath);

    await sharp(uploadedFilePath)
      .rotate()
      .resize({ width: 1920, withoutEnlargement: true })
      .webp({ effort: 6 })
      .toFile(tempWebpPath);

    const postersDir = path.join(ENV.GALLERY_MEDIA_PATH, galleryId, ".posters", mediaId);
    fs.mkdirSync(postersDir, { recursive: true, mode: 0o700 });

    const finalAvifPath = path.join(postersDir, newRevision + ".avif");
    const finalWebpPath = path.join(postersDir, newRevision + ".webp");

    fs.renameSync(tempAvifPath, finalAvifPath);
    fs.renameSync(tempWebpPath, finalWebpPath);
    fs.chmodSync(finalAvifPath, 0o600);
    fs.chmodSync(finalWebpPath, 0o600);

    const oldRevision = media.poster_revision;

    try {
      db.exec("BEGIN TRANSACTION");
      try {
        db.prepare("UPDATE gallery_media SET poster_revision = ? WHERE id = ?").run(newRevision, mediaId);
        db.exec("COMMIT");
      } catch (dbErr) {
        db.exec("ROLLBACK");
        throw dbErr;
      }
    } catch {
      // Rollback files
      try { fs.unlinkSync(finalAvifPath); } catch { /* ignore */ }
      try { fs.unlinkSync(finalWebpPath); } catch { /* ignore */ }
      return jsonError("Database error during poster update", 500);
    }

    // Cleanup old revision
    if (oldRevision) {
      try { fs.unlinkSync(path.join(postersDir, oldRevision + ".avif")); } catch { /* ignore */ }
      try { fs.unlinkSync(path.join(postersDir, oldRevision + ".webp")); } catch { /* ignore */ }
    }

    return Response.json({ success: true, revision: newRevision }, { headers: { "Cache-Control": "no-store" } });

  } catch (error: unknown) {
    if (error instanceof UploadRequestError) return jsonError(error.message, error.status);
    return jsonError("Internal Server Error", 500);
  } finally {
    if (tempDirectory) {
      try { fs.rmSync(tempDirectory, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }
}
