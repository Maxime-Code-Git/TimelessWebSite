import type { LoaderFunctionArgs } from "react-router";
import { requireGalleryAccess, GALLERY_PRIVATE_HEADERS } from "~/lib/gallery-auth.server";
import { ENV } from "~/lib/env.server";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { parseRangeHeader, parseWidth, parseFormat } from "~/lib/media-utils";

export async function loader({ request, params }: LoaderFunctionArgs) {
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
  const filePath = path.join(ENV.GALLERY_MEDIA_PATH, galleryId, mediaIdStr);
  if (!fs.existsSync(filePath)) {
    return new Response("File not found", { status: 404, headers: GALLERY_PRIVATE_HEADERS });
  }

  const stat = fs.statSync(filePath);
  const size = stat.size;

  if (media.type === "video") {
    const range = request.headers.get("range");
    if (range !== null) {

      let start: number;
      let end: number;
      try {
        const parsed = parseRangeHeader(range, size);
        if (!parsed) {
          return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, ...GALLERY_PRIVATE_HEADERS } });
        }
        start = parsed.start;
        end = parsed.end;
      } catch {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, ...GALLERY_PRIVATE_HEADERS } });
      }
const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });
      const webStream = Readable.toWeb(fileStream) as ReadableStream;

      return new Response(webStream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize.toString(),
          "Content-Type": media.mime_type as string,
          ...GALLERY_PRIVATE_HEADERS
        }
      });
    } else {
      const fileStream = fs.createReadStream(filePath);
      const webStream = Readable.toWeb(fileStream) as ReadableStream;
      return new Response(webStream, {
        status: 200,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": size.toString(),
          "Content-Type": media.mime_type as string,
          ...GALLERY_PRIVATE_HEADERS
        }
      });
    }
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

  const targetFormat = parseFormat(formatParam);
  if (targetFormat !== "webp") {
    return new Response("Bad Request: only webp format is supported", { status: 400, headers: GALLERY_PRIVATE_HEADERS });
  }

  const isAllowedWidth = (w: number): w is 480 | 960 | 1920 => [480, 960, 1920].includes(w);

  if (!isAllowedWidth(targetWidth)) {
    return new Response("Bad Request: invalid width", { status: 400, headers: GALLERY_PRIVATE_HEADERS });
  }

  try {
    const { ensurePreview, getPreviewPath } = await import("~/lib/gallery-preview.server");
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
