import type { LoaderFunctionArgs } from "react-router";
import { requireGalleryAccess, GALLERY_PRIVATE_HEADERS } from "~/lib/gallery-auth.server";
import { ENV } from "~/lib/env.server";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
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

  // Photo: resize on the fly with width parameter support

  const url = new URL(request.url);
  const widthParam = url.searchParams.get("width");
    const formatParam = url.searchParams.get("format");
  let targetWidth = 1920;
  let targetFormat: "jpeg" | "webp" | "avif" | null;


  try {
    const parsedW = parseWidth(widthParam);
    if (parsedW) targetWidth = parsedW;
    targetFormat = parseFormat(formatParam);
  } catch {
    return new Response("Bad Request", { status: 400, headers: GALLERY_PRIVATE_HEADERS });
  }

  const accept = request.headers.get("Accept") || "";
  let format: "jpeg" | "webp" | "avif" = "jpeg";

  if (targetFormat === "avif" || (!targetFormat && accept.includes("image/avif"))) {
    format = "avif";
  } else if (targetFormat === "webp" || (!targetFormat && accept.includes("image/webp"))) {
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
