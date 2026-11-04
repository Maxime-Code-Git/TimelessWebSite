import type { LoaderFunctionArgs } from "react-router";
import { requireGalleryAccess, GALLERY_PRIVATE_HEADERS } from "~/lib/gallery-auth.server";
import { ENV } from "~/lib/env.server";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { parseRangeHeader, parseWidth, parseFormat } from "~/lib/media-utils";
import { ensurePreview, getPreviewPath } from "~/lib/gallery-preview.server";
import { openGalleryVideoForPlayback } from "~/lib/gallery-video-preview.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...GALLERY_PRIVATE_HEADERS, Allow: "GET, HEAD" },
    });
  }

  const { publicId, mediaId } = params;
  if (!publicId || !mediaId) {
    return new Response("Bad Request", { status: 400, headers: GALLERY_PRIVATE_HEADERS });
  }

  const { gallery, media } = await requireGalleryAccess(request, publicId, mediaId, true);
  if (!media) {
    return new Response("Media not found", { status: 404, headers: GALLERY_PRIVATE_HEADERS });
  }

  const galleryId = gallery.id as string;
  const mediaIdStr = media.id as string;

  if (media.type === "video") {
    const url = new URL(request.url);
    const usePreview = url.searchParams.get("variant") === "preview";

    let video: { filePath: string; size: number; contentType: string };
    try {
      video = openGalleryVideoForPlayback(galleryId, mediaIdStr, (media.mime_type as string) || "video/mp4", usePreview);
    } catch {
      return new Response("File not found", { status: 404, headers: GALLERY_PRIVATE_HEADERS });
    }

    const { filePath, size: totalSize, contentType } = video;
    const rangeHeader = request.headers.get("range");

    if (rangeHeader !== null) {
      let parsed: { start: number; end: number } | null;
      try {
        parsed = parseRangeHeader(rangeHeader, totalSize);
      } catch {
        parsed = null;
      }

      if (!parsed) {
        return new Response(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${totalSize}`,
            "Accept-Ranges": "bytes",
            ...GALLERY_PRIVATE_HEADERS,
          },
        });
      }

      const { start, end } = parsed;
      const chunkSize = end - start + 1;

      if (request.method === "HEAD") {
        return new Response(null, {
          status: 206,
          headers: {
            "Content-Range": `bytes ${start}-${end}/${totalSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunkSize.toString(),
            "Content-Type": contentType,
            ...GALLERY_PRIVATE_HEADERS,
          },
        });
      }

      const fileStream = fs.createReadStream(filePath, { start, end });
      request.signal.addEventListener("abort", () => {
        fileStream.destroy();
      });
      const webStream = Readable.toWeb(fileStream) as ReadableStream;

      return new Response(webStream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${totalSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
          "Content-Type": contentType,
          ...GALLERY_PRIVATE_HEADERS,
        },
      });
    }

    if (request.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": totalSize.toString(),
          "Content-Type": contentType,
          ...GALLERY_PRIVATE_HEADERS,
        },
      });
    }

    const fileStream = fs.createReadStream(filePath);
    request.signal.addEventListener("abort", () => {
      fileStream.destroy();
    });
    const webStream = Readable.toWeb(fileStream) as ReadableStream;

    return new Response(webStream, {
      status: 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": totalSize.toString(),
        "Content-Type": contentType,
        ...GALLERY_PRIVATE_HEADERS,
      },
    });
  }

  const filePath = path.join(ENV.GALLERY_MEDIA_PATH, galleryId, mediaIdStr);
  if (!fs.existsSync(filePath)) {
    return new Response("File not found", { status: 404, headers: GALLERY_PRIVATE_HEADERS });
  }

  // Photo: persistent previews
  const url = new URL(request.url);
  const widthParam = url.searchParams.get("width");
  const formatParam = url.searchParams.get("format");

  if (!widthParam || !formatParam) {
    return new Response("Bad Request: width and format are required", { status: 400, headers: GALLERY_PRIVATE_HEADERS });
  }

  let targetWidth: number;
  try {
    const parsedW = parseWidth(widthParam);
    if (!parsedW) throw new Error();
    targetWidth = parsedW;
  } catch {
    return new Response("Bad Request: invalid width", { status: 400, headers: GALLERY_PRIVATE_HEADERS });
  }

  let targetFormat: string | null | undefined;
  try {
    targetFormat = parseFormat(formatParam);
  } catch {
    return new Response("Bad Request: invalid format", { status: 400, headers: GALLERY_PRIVATE_HEADERS });
  }
  if (targetFormat !== "webp") {
    return new Response("Bad Request: only webp format is supported", { status: 400, headers: GALLERY_PRIVATE_HEADERS });
  }

  const isAllowedWidth = (w: number): w is 480 | 960 | 1920 => [480, 960, 1920].includes(w);

  if (!isAllowedWidth(targetWidth)) {
    return new Response("Bad Request: invalid width", { status: 400, headers: GALLERY_PRIVATE_HEADERS });
  }

  try {
    await ensurePreview(galleryId, mediaIdStr, targetWidth);

    const previewPath = getPreviewPath(galleryId, mediaIdStr, targetWidth);
    const previewStat = fs.statSync(previewPath);
    const fileStream = fs.createReadStream(previewPath);
    const webStream = Readable.toWeb(fileStream) as ReadableStream;

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Length": previewStat.size.toString(),
        "Content-Type": "image/webp",
        "X-Content-Type-Options": "nosniff",
        ...GALLERY_PRIVATE_HEADERS
      }
    });
  } catch (error) {
    console.error("Failed to serve preview:", error);
    return new Response("Internal Server Error", { status: 500, headers: GALLERY_PRIVATE_HEADERS });
  }
}
