import { type ActionFunctionArgs } from "react-router";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import busboy from "busboy";
import { requireValidAdminSession } from "../lib/admin-auth.server";
import { validateOrigin } from "../lib/security.server";
import {
  CorruptedContentError,
  RevisionConflictError,
  ValidationError,
  getRawSiteContent,
  saveHomeSettings,
  type HomeContent,
} from "../lib/site-content.server";
import { processHomeImage, prepareHomeImageDeletion, MediaTransactionError } from "../lib/home-media.server";
import { SafeImageError } from "../lib/portfolio-image.server";
import { getWatermarkConfig } from "../lib/portfolio-content.server";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

class UploadRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "UploadRequestError";
  }
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
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

    file.on("limit", () => fail(new UploadRequestError("File too large.", 413)));
    file.on("error", () => fail(new UploadRequestError("Upload stream failed.", 400)));
    activeWriteStream.on("error", () => fail(new UploadRequestError("Upload storage failed.", 500)));

    const currentWriteStream = activeWriteStream;
    fileWritePromise = finished(currentWriteStream).then(() => {
      uploadedFilePath = tempPath;
      activeWriteStream = null;
    });
    void fileWritePromise.catch(error => {
      fail(error instanceof UploadRequestError ? error : new UploadRequestError("Upload storage failed.", 500));
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
        fail(error instanceof Error ? error : new UploadRequestError("Upload failed.", 400));
      }
    })();
  });

  let bytesRead = 0;
  try {
    while (!settled) {
      const { done, value } = await reader.read();
      if (done) break;

      bytesRead += value.length;
      if (bytesRead > MAX_FILE_SIZE) {
        fail(new UploadRequestError("Payload too large.", 413));
        break;
      }

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

export async function loader() {
  return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }

  const session = await requireValidAdminSession(request);
  if (!validateOrigin(request)) return jsonError("Forbidden", 403);

  const csrfToken = request.headers.get("x-csrf-token");
  if (!csrfToken || csrfToken !== session.get("csrfToken")) {
    return jsonError("Forbidden", 403);
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!/^multipart\/form-data\s*;[^\r\n]*boundary=/i.test(contentType)) {
    return jsonError("Unsupported Media Type", 415);
  }

  const previousRevision = request.headers.get("x-home-revision");
  if (!previousRevision || !/^[0-9a-f]{32}$/.test(previousRevision)) {
    return jsonError("Invalid revision", 400);
  }

  const section = request.headers.get("x-home-section");
  if (!section || !["hero", "portfolio-photo", "portfolio-video", "studio"].includes(section)) {
    return jsonError("Invalid section", 400);
  }

  const indexStr = request.headers.get("x-home-index");
  let heroIndex: number | null = null;
  if (section === "hero") {
    if (!indexStr || !["0", "1", "2"].includes(indexStr)) {
      return jsonError("Invalid index for hero", 400);
    }
    heroIndex = parseInt(indexStr, 10);
  }

  const current = getRawSiteContent();
  if (current.isCorrupted) {
    return jsonError("Corrupted site content", 500);
  }
  if (current.content.revision !== previousRevision) {
    return jsonError("Revision conflict", 409);
  }

  let tempDirectory: string | null = null;
  try {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-home-upload-"));
    fs.chmodSync(tempDirectory, 0o700);

    const uploadedFilePath = await parseSingleUpload(request, contentType, tempDirectory);
    const watermark = getWatermarkConfig();

    const processed = await processHomeImage(
      uploadedFilePath,
      tempDirectory,
      section as "hero" | "portfolio-photo" | "portfolio-video" | "studio",
      watermark.text,
      watermark.revision
    );

    // Atomically save to JSON
    let oldImageId: string | null = null;
    const newHome: HomeContent = structuredClone(current.content.home);

    if (section === "hero" && heroIndex !== null) {
      oldImageId = newHome.hero.images[heroIndex].imageId;
      newHome.hero.images[heroIndex].imageId = processed.imageId;
      newHome.hero.images[heroIndex].width = processed.originalWidth;
      newHome.hero.images[heroIndex].height = processed.originalHeight;
      newHome.hero.images[heroIndex].variants = processed.variants;
    } else if (section === "portfolio-photo") {
      oldImageId = newHome.portfolioCards.photo.imageId;
      newHome.portfolioCards.photo.imageId = processed.imageId;
      newHome.portfolioCards.photo.width = processed.originalWidth;
      newHome.portfolioCards.photo.height = processed.originalHeight;
      newHome.portfolioCards.photo.variants = processed.variants;
    } else if (section === "portfolio-video") {
      oldImageId = newHome.portfolioCards.video.imageId;
      newHome.portfolioCards.video.imageId = processed.imageId;
      newHome.portfolioCards.video.width = processed.originalWidth;
      newHome.portfolioCards.video.height = processed.originalHeight;
      newHome.portfolioCards.video.variants = processed.variants;
    } else if (section === "studio") {
      oldImageId = newHome.studio.imageId;
      newHome.studio.imageId = processed.imageId;
      newHome.studio.width = processed.originalWidth;
      newHome.studio.height = processed.originalHeight;
      newHome.studio.variants = processed.variants;
    }

    const transaction = oldImageId ? prepareHomeImageDeletion(section, oldImageId) : null;

    try {
      const newRevision = saveHomeSettings(newHome, previousRevision);

      // Cleanup old image quarantine if save succeeds
      if (transaction) {
        transaction.commit();
      }

      return Response.json({
        success: true,
        newRevision,
        imageId: processed.imageId,
        variants: processed.variants,
        width: processed.originalWidth,
        height: processed.originalHeight
      }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } });
    } catch (error: unknown) {
      // Rollback processed files
      try {
        if (transaction) {
          transaction.rollback();
        }
        // Then delete the newly created image since JSON save failed
        const newImageCleanup = prepareHomeImageDeletion(section, processed.imageId);
        newImageCleanup.commit();
      } catch (e) {
        // Un échec de rollback doit produire une erreur spécifique, avec cause, sans être masqué.
        if (e instanceof MediaTransactionError) {
          throw e;
        }
        throw new MediaTransactionError("Rollback failed for " + section, { cause: e });
      }

      if (error instanceof RevisionConflictError || error instanceof CorruptedContentError) {
        return jsonError("Revision conflict", 409);
      }
      if (error instanceof ValidationError) return jsonError(error.message, 422);
      return jsonError("Internal Server Error", 500);
    }
  } catch (error: unknown) {
    if (error instanceof UploadRequestError) return jsonError(error.message, error.status);
    if (error instanceof SafeImageError) return jsonError(error.message, 422);
    return jsonError("Internal Server Error", 500);
  } finally {
    if (tempDirectory) {
      try { fs.rmSync(tempDirectory, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }
}
