import type { LoaderFunctionArgs } from "react-router";
import { requireGalleryAccess, GALLERY_PRIVATE_HEADERS } from "~/lib/gallery-auth.server";
import { ENV } from "~/lib/env.server";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Readable } from "node:stream";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { publicId, mediaId } = params;
  if (!publicId || !mediaId) return new Response("Bad Request", { status: 400 });

  const { gallery, media } = await requireGalleryAccess(request, publicId, mediaId);
  if (!media) return new Response("Media not found", { status: 404 });

  const filePath = path.join(ENV.GALLERY_MEDIA_PATH, gallery.id as string, media.id as string);
  if (!fs.existsSync(filePath)) {
    return new Response("File not found", { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const size = stat.size;

  if (media.type === "video") {
    const range = request.headers.get("range");
    if (range) {
      const match = range.match(/^bytes=(\d+)-(\d*)$/);
      if (!match) {
        return new Response(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${size}`,
            ...GALLERY_PRIVATE_HEADERS
          }
        });
      }

      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : size - 1;

      if (isNaN(start) || start < 0 || start >= size || (match[2] && (isNaN(end) || end >= size || end < start))) {
        return new Response(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${size}`,
            ...GALLERY_PRIVATE_HEADERS
          }
        });
      }

      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });
      const webStream = Readable.toWeb(fileStream) as ReadableStream;

      const head = {
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize.toString(),
        "Content-Type": media.mime_type as string,
        ...GALLERY_PRIVATE_HEADERS
      };

      return new Response(webStream, { status: 206, headers: head });
    } else {
      const head = {
        "Content-Length": size.toString(),
        "Content-Type": media.mime_type as string,
        ...GALLERY_PRIVATE_HEADERS
      };
      const fileStream = fs.createReadStream(filePath);
      const webStream = Readable.toWeb(fileStream) as ReadableStream;
      return new Response(webStream, { status: 200, headers: head });
    }
  }

  // It's a photo, compress and resize on the fly
  const accept = request.headers.get("Accept") || "";
  let format: "jpeg" | "webp" | "avif" = "jpeg";
  if (accept.includes("image/avif")) format = "avif";
  else if (accept.includes("image/webp")) format = "webp";

  const transform = sharp(filePath)
    .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
    .toFormat(format, { quality: 80 });

  return new Response(Readable.toWeb(transform) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": `image/${format}`,
      ...GALLERY_PRIVATE_HEADERS
    }
  });
}
