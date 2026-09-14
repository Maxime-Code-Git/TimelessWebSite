import type { LoaderFunctionArgs } from "react-router";
import { requireGalleryAccess, GALLERY_PRIVATE_HEADERS } from "~/lib/gallery-auth.server";
import { ENV } from "~/lib/env.server";
import fs from "node:fs";
import path from "node:path";
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

  const fileStream = fs.createReadStream(filePath);
  const webStream = Readable.toWeb(fileStream) as ReadableStream;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Length": size.toString(),
      "Content-Type": (media.mime_type as string) || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent((media.original_name as string) || "media")}"`,
      ...GALLERY_PRIVATE_HEADERS
    }
  });
}
