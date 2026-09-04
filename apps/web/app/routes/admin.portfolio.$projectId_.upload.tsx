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
  addPhotoToProject,
  assertPortfolioRevision,
  getPortfolioMediaPath,
  getWatermarkConfig,
  getProjectById,
} from "../lib/portfolio-content.server";
import {
  CorruptedContentError,
  RevisionConflictError,
  ValidationError,
} from "../lib/site-content.server";
import {
  processImage,
  removeProcessedImage,
  SafeImageError,
} from "../lib/portfolio-image.server";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
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
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function loader() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
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

  const projectId = params.projectId;
  if (!projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    return jsonError("Not Found", 404);
  }

  const previousRevision = request.headers.get("x-portfolio-revision");
  if (!previousRevision || !/^[0-9a-f]{32}$/.test(previousRevision)) {
    return jsonError("Invalid revision", 400);
  }

  try {
    assertPortfolioRevision(previousRevision);
  } catch (error: unknown) {
    if (error instanceof RevisionConflictError || error instanceof CorruptedContentError) {
      return jsonError("Revision conflict", 409);
    }
    return jsonError("Internal Server Error", 500);
  }

  const project = getProjectById(projectId);
  if (!project) return jsonError("Not Found", 404);
  if (project.status === "published") {
    return jsonError("Unpublish this project before adding photos.", 422);
  }

  let tempDirectory: string | null = null;
  try {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-portfolio-upload-"));
    fs.chmodSync(tempDirectory, 0o700);

    const uploadedFilePath = await parseSingleUpload(request, contentType, tempDirectory);
    const watermark = getWatermarkConfig();
    const processed = await processImage(
      uploadedFilePath,
      tempDirectory,
      projectId,
      getPortfolioMediaPath(),
      watermark.text,
      watermark.revision
    );

    try {
      const result = addPhotoToProject(projectId, {
        fileId: processed.fileId,
        originalFormat: processed.originalFormat,
        originalWidth: processed.originalWidth,
        originalHeight: processed.originalHeight,
        category: "ceremony",
        alt: { fr: "À définir", en: "To be defined" },
        variants: processed.variants,
        appliedWatermarkRevision: processed.appliedWatermarkRevision,
        processedAt: new Date().toISOString(),
      }, previousRevision);

      return Response.json({
        success: true,
        newRevision: result.newRevision,
        photoId: result.newPhotoId,
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error: unknown) {
      try {
        removeProcessedImage(projectId, getPortfolioMediaPath(), processed);
      } catch {
        return jsonError("Generated media cleanup failed.", 500);
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
