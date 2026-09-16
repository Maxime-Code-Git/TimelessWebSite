import type { LoaderFunctionArgs } from "react-router";
import { requireGalleryAccess, GALLERY_PRIVATE_HEADERS } from "~/lib/gallery-auth.server";
import { ENV } from "~/lib/env.server";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Readable } from "node:stream";

const VALID_WIDTHS = new Set([480, 960, 1440, 1920]);

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
    if (range && range.startsWith("bytes=")) {
      let start: number;
      let end: number;

      if (range.startsWith("bytes=-")) {
        const suffix = parseInt(range.substring(7), 10);
        if (isNaN(suffix) || suffix <= 0) {
          return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, ...GALLERY_PRIVATE_HEADERS } });
        }
        start = Math.max(0, size - suffix);
        end = size - 1;
      } else {
        const match = range.match(/^bytes=(\d+)-(\d*)$/);
        if (!match) {
          return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, ...GALLERY_PRIVATE_HEADERS } });
        }
        start = parseInt(match[1], 10);
        end = match[2] ? parseInt(match[2], 10) : size - 1;
      }

      if (isNaN(start) || start < 0 || start >= size || isNaN(end) || end >= size || end < start) {
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

  // Photo: resize on the fly with width parameter support
  const url = new URL(request.url);
  const widthParam = url.searchParams.get("width");
  let targetWidth = 1920;
  if (widthParam) {
    const parsed = parseInt(widthParam, 10);
    if (VALID_WIDTHS.has(parsed)) {
      targetWidth = parsed;
    }
  }

  // Content negotiation for format
  const accept = request.headers.get("Accept") || "";
  const formatParam = url.searchParams.get("format");
  let format: "jpeg" | "webp" | "avif" = "jpeg";

  if (formatParam === "avif" || (!formatParam && accept.includes("image/avif"))) {
    format = "avif";
  } else if (formatParam === "webp" || (!formatParam && accept.includes("image/webp"))) {
    format = "webp";
  }

  const transform = sharp(filePath)
    .resize(targetWidth, targetWidth, { fit: "inside", withoutEnlargement: true })
    .toFormat(format, { quality: 80 });

  return new Response(Readable.toWeb(transform) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": `image/${format}`,
      "Vary": "Accept",
      ...GALLERY_PRIVATE_HEADERS
    }
  });
}
