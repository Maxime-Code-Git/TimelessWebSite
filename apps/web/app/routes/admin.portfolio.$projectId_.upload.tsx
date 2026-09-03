import { type ActionFunctionArgs } from "react-router";
import { requireValidAdminSession } from "../lib/admin-auth.server";
import { validateOrigin } from "../lib/security.server";
import { addPhotoToProject, getPortfolioMediaPath, getWatermarkConfig } from "../lib/portfolio-content.server";
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
    console.error("UPLOAD ERROR: Missing revision");
    return new Response("Missing revision", { status: 400 });
  }

  // Create isolated temp folder with 0700 permissions
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-portfolio-upload-"));
  fs.chmodSync(tmpDir, 0o700);

  try {
    let uploadedFilePath: string | null = null;
    let fileCount = 0;

    await new Promise<void>((resolve, reject) => {
      const bb = busboy({ headers: { "content-type": contentType }, limits: { files: 1, fileSize: MAX_FILE_SIZE } });
      const filePromises: Promise<void>[] = [];

      bb.on("file", (name, file, _info) => {
        if (name !== "file") {
          file.resume();
          return reject(new Error("Unexpected field"));
        }

        const mime = _info.mimeType.toLowerCase();
        if (!mime.startsWith("image/") || (!mime.includes("jpeg") && !mime.includes("png") && !mime.includes("webp"))) {
          file.resume();
          return reject(new Error("Unsupported file type"));
        }

        fileCount++;
        if (fileCount > 1) {
          file.resume();
          return reject(new Error("Too many files per request"));
        }

        const tmpPath = path.join(tmpDir, crypto.randomUUID());
        const fd = fs.openSync(tmpPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
        const writeStream = fs.createWriteStream("", { fd });

        const filePromise = new Promise<void>((fileResolve, fileReject) => {
          file.on("limit", () => {
            writeStream.destroy();
            fileReject(new Error("File too large"));
          });

          writeStream.on("finish", () => {
            uploadedFilePath = tmpPath;
            fileResolve();
          });

          writeStream.on("error", fileReject);
        });

        filePromises.push(filePromise);
        file.pipe(writeStream);
      });

      bb.on("error", reject);
      bb.on("finish", () => {
        Promise.all(filePromises).then(() => resolve()).catch(reject);
      });

      // Pipe the Web Request body to Busboy
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
            this.destroy(err as Error);
          }
        }
      });
      stream.pipe(bb);
    });

    if (!uploadedFilePath || !fs.existsSync(uploadedFilePath)) {
      return new Response("Bad Request: File missing or failed", { status: 400 });
    }

    if (!uploadedFilePath || !fs.existsSync(uploadedFilePath)) {
      console.error("UPLOAD ERROR: File missing or failed");
      return new Response("Bad Request: File missing or failed", { status: 400 });
    }

    // Process the image
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

    // Append to JSON
    try {
      const result = addPhotoToProject(projectId, {
        fileId: processResult.fileId,
        originalFormat: processResult.originalFormat,
        originalWidth: processResult.originalWidth,
        originalHeight: processResult.originalHeight,
        category: "ceremony", // Default category
        alt: { fr: "À définir", en: "To be defined" }, // Default non-empty alts
        variants: processResult.variants,
        appliedWatermarkRevision: processResult.appliedWatermarkRevision,
        processedAt: new Date().toISOString(),
      }, previousRevision);

      return new Response(JSON.stringify({ success: true, newRevision: result.newRevision, photoId: result.newPhotoId }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (err: unknown) {
      console.error("ADD PHOTO TO PROJECT FAILED:", err);
      // If JSON fails, rollback newly generated variants and original
      try {
        const originalPath = path.join(getPortfolioMediaPath(), projectId, "originals", `${processResult.fileId}.${processResult.originalFormat}`);
        if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
      } catch { /* ignore */ }

      for (const variant of processResult.variants) {
        const variantPath = path.join(getPortfolioMediaPath(), projectId, variant.name, `${variant.fileId}.webp`);
        try { if (fs.existsSync(variantPath)) fs.unlinkSync(variantPath); } catch { /* ignore */ }
      }
      return new Response(JSON.stringify({ error: "Revision conflict or metadata error" }), { status: 409, headers: { "Content-Type": "application/json" } });
    }

  } catch (err: unknown) {
    console.error("UPLOAD ERROR CAUGHT:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Upload failed" }), { status: 400, headers: { "Content-Type": "application/json" } });
  } finally {
    // Cleanup temporary directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
}
