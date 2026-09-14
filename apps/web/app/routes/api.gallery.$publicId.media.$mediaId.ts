import type { LoaderFunctionArgs } from "react-router";
import { getGallerySession } from "~/lib/gallery-auth.server";
import type { GalleryAccessLevel } from "~/lib/gallery-auth.server";
import { getGalleryDb } from "~/lib/gallery-db.server";
import { ENV } from "~/lib/env.server";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const session = await getGallerySession(request);
  const galleryId = session.get("galleryId");
  const accessLevel = session.get("accessLevel") as GalleryAccessLevel | undefined;
  const codeVersion = session.get("codeVersion") as number | undefined;

  if (!galleryId || !accessLevel || codeVersion === undefined) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { publicId, mediaId } = params;
  if (!publicId || !mediaId) return new Response("Bad Request", { status: 400 });

  const db = getGalleryDb();
  
  // Verify gallery & session match
  const gallery = db.prepare("SELECT * FROM galleries WHERE public_id = ?").get(publicId) as { id: string, status: string, expires_at: number, couple_code_version: number, guest_code_version: number } | undefined;
  if (!gallery || gallery.id !== galleryId || gallery.status !== "published" || gallery.expires_at < Date.now()) {
    return new Response("Unauthorized", { status: 401 });
  }
  const currentVersion = accessLevel === "maries" ? gallery.couple_code_version : gallery.guest_code_version;
  if (codeVersion !== currentVersion) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Verify media access
  const media = db.prepare("SELECT * FROM gallery_media WHERE id = ? AND gallery_id = ?").get(mediaId, galleryId) as { id: string, visibility: string, type: string, mime_type: string } | undefined;
  if (!media) return new Response("Not found", { status: 404 });
  if (media.visibility === "maries" && accessLevel === "invites") {
    return new Response("Forbidden", { status: 403 });
  }

  const filePath = path.join(ENV.GALLERY_MEDIA_PATH, gallery.id, media.id);
  if (!fs.existsSync(filePath)) {
    return new Response("File not found", { status: 404 });
  }

  const stat = fs.statSync(filePath);
  
  if (media.type === "video") {
    const range = request.headers.get("range");
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": media.mime_type || "video/mp4",
        "Cache-Control": "private, max-age=3600"
      };
      // @ts-expect-error Response supports stream
      return new Response(file, { status: 206, headers: head });
    } else {
      const head = {
        "Content-Length": stat.size,
        "Content-Type": media.mime_type || "video/mp4",
        "Cache-Control": "private, max-age=3600"
      };
      // @ts-expect-error Response supports stream
      return new Response(fs.createReadStream(filePath), { status: 200, headers: head });
    }
  }

  // It's a photo, compress and resize on the fly
  const accept = request.headers.get("Accept") || "";
  let format = "jpeg";
  if (accept.includes("image/avif")) format = "avif";
  else if (accept.includes("image/webp")) format = "webp";

  const transform = sharp(filePath)
    .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
    .toFormat(format as "jpeg" | "webp" | "avif", { quality: 80 });

  return new Response(transform as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": `image/${format}`,
      "Cache-Control": "private, max-age=3600"
    }
  });
}
