import { type ActionFunctionArgs } from "react-router";
import { requireValidAdminSession } from "../lib/admin-auth.server";
import { validateOrigin } from "../lib/security.server";
import { addPhotoToProject, getPortfolioMediaPath, getWatermarkConfig, getProjectById } from "../lib/portfolio-content.server";
import { RevisionConflictError } from "../lib/site-content.server";
import { processImage, SafeImageError } from "../lib/portfolio-image.server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import busboy from "busboy";
import { Readable } from "node:stream";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MiB

export async function loader() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  // 1. Session admin and POST
  const session = await requireValidAdminSession(request);

  // 2. Strict Origin check
  if (!validateOrigin(request)) {
    return new Response("Forbidden", { status: 403 });
  }

  // 3. CSRF Validation via custom header
  const csrfToken = request.headers.get("x-csrf-token");
  if (!csrfToken || csrfToken !== session.get("csrfToken")) {
    return new Response("Forbidden", { status: 403 });
  }

  // 4. Content-Type Validation
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data") || !contentType.includes("boundary=")) {
    return new Response("Unsupported Media Type", { status: 415 });
  }

  const projectId = params.projectId;
  if (!projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    return new Response("Not Found", { status: 404 });
  }

  const previousRevision = request.headers.get("x-portfolio-revision");
  if (!previousRevision) {
    return new Response(JSON.stringify({ error: "Missing revision" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const project = getProjectById(projectId);
  if (!project) {
    return new Response("Not Found", { status: 404 });
  }
  if (project.status === "published") {
    return new Response(JSON.stringify({ error: "Cannot upload to a published project" }), { status: 422, headers: { "Content-Type": "application/json" } });
  }

  let tmpDir: string;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-portfolio-upload-"));
    fs.chmodSync(tmpDir, 0o700);
  } catch (err) {
    return new Response("Internal Server Error", { status: 500 });
  }

  try {
    let uploadedFilePath: string | null = null;
    let fileCount = 0;

    await new Promise<void>((resolve, reject) => {
      let isAborted = false;
      const bb = busboy({ headers: { "content-type": contentType }, limits: { files: 1, fields: 0, parts: 1, fileSize: MAX_FILE_SIZE } });
      const filePromises: Promise<void>[] = [];
      let activeStream: fs.WriteStream | null = null;

      bb.on("file", (name, file, _info) => {
        if (name !== "file") {
          file.resume();
          return reject(new Error("Unexpected field"));
        }

        const mime = _info.mimeType;
        if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
          file.resume();
          return reject(new Error("Unsupported file type"));
        }

        fileCount++;
        if (fileCount > 1) {
          file.resume();
          return reject(new Error("Too many files per request"));
        }

        const tmpPath = path.join(tmpDir, crypto.randomUUID());
        let fd: number;
        try {
          fd = fs.openSync(tmpPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
        } catch (err) {
          file.resume();
          return reject(new Error("Failed to create temp file"));
        }

        const writeStream = fs.createWriteStream("", { fd });
        activeStream = writeStream;

        const filePromise = new Promise<void>((fileResolve, fileReject) => {
          file.on("limit", () => {
            if (activeStream) {
              activeStream.destroy();
              activeStream = null;
            }
            fileReject(new Error("File too large"));
          });

          writeStream.on("finish", () => {
            if (!isAborted) uploadedFilePath = tmpPath;
            activeStream = null;
            fileResolve();
          });

          writeStream.on("error", (err) => {
            activeStream = null;
            fileReject(new Error("Stream write error"));
          });
        });

        filePromises.push(filePromise);
        file.pipe(writeStream);
      });

      bb.on("partsLimit", () => reject(new Error("Too many parts")));
      bb.on("filesLimit", () => reject(new Error("Too many files")));
      bb.on("fieldsLimit", () => reject(new Error("Too many fields")));

      bb.on("error", (err) => {
        isAborted = true;
        if (activeStream) activeStream.destroy();
        reject(new Error("Busboy error"));
      });

      bb.on("close", () => {
        Promise.all(filePromises).then(() => resolve()).catch(reject);
      });

      if (!request.body) return reject(new Error("No body"));

      const reader = request.body.getReader();
      const stream = new Readable({
        async read() {
          try {
            const { done, value } = await reader.read();
            if (done) {
              this.push(null);
            } else {
              this.push(Buffer.from(value));
            }
          } catch (err) {
            isAborted = true;
            this.destroy(err as Error);
          }
        }
      });

      stream.on("error", (err) => {
        isAborted = true;
        reject(new Error("Readable stream error"));
      });

      stream.pipe(bb);
    });

    if (!uploadedFilePath || !fs.existsSync(uploadedFilePath)) {
      return new Response(JSON.stringify({ error: "File missing or failed" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    let processResult;
    try {
      const watermark = getWatermarkConfig();
      processResult = await processImage(
        uploadedFilePath,
        tmpDir,
        projectId,
        getPortfolioMediaPath(),
        watermark.text,
        watermark.revision
      );
    } catch (err: unknown) {
      if (err instanceof SafeImageError) {
        return new Response(JSON.stringify({ error: err.message }), { status: 422, headers: { "Content-Type": "application/json" } });
      }
      return new Response("Internal Server Error", { status: 500 });
    }

    try {
      const result = addPhotoToProject(projectId, {
        fileId: processResult.fileId,
        originalFormat: processResult.originalFormat,
        originalWidth: processResult.originalWidth,
        originalHeight: processResult.originalHeight,
        category: "ceremony",
        alt: { fr: "À définir", en: "To be defined" },
        variants: processResult.variants,
        appliedWatermarkRevision: processResult.appliedWatermarkRevision,
        processedAt: new Date().toISOString(),
      }, previousRevision);

      return new Response(JSON.stringify({ success: true, newRevision: result.newRevision, photoId: result.newPhotoId }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (err: unknown) {
      try {
        const originalPath = path.join(getPortfolioMediaPath(), projectId, "originals", `${processResult.fileId}.${processResult.originalFormat}`);
        if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
      } catch { /* ignore */ }

      for (const variant of processResult.variants) {
        const variantPath = path.join(getPortfolioMediaPath(), projectId, variant.name, `${variant.fileId}.webp`);
        try { if (fs.existsSync(variantPath)) fs.unlinkSync(variantPath); } catch { /* ignore */ }
      }

      if (err instanceof RevisionConflictError) {
        return new Response(JSON.stringify({ error: "Revision conflict" }), { status: 409, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Validation error" }), { status: 422, headers: { "Content-Type": "application/json" } });
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    const status = message === "File too large" ? 413 : 400;
    const errorMsg = message === "File too large" ? message : "Upload failed";
    return new Response(JSON.stringify({ error: errorMsg }), { status, headers: { "Content-Type": "application/json" } });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}
