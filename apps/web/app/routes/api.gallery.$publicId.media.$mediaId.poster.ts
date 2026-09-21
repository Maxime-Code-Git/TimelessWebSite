import type { LoaderFunctionArgs } from "react-router";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { requireGalleryAccess, GALLERY_PRIVATE_HEADERS } from "../lib/gallery-auth.server";
import { ENV } from "../lib/env.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const publicId = params.publicId;
  const mediaId = params.mediaId;

  if (!publicId || !mediaId) {
    return new Response("Not found", { status: 404, headers: GALLERY_PRIVATE_HEADERS });
  }

  const { gallery, media } = await requireGalleryAccess(request, publicId, mediaId, true);

  if (!media) {
    return new Response("Not found", { status: 404, headers: GALLERY_PRIVATE_HEADERS });
  }

  if (media.type !== "video" || !media.poster_revision) {
    return new Response("Not found", { status: 404, headers: GALLERY_PRIVATE_HEADERS });
  }

  const acceptHeader = request.headers.get("Accept") || "";
  const preferAvif = acceptHeader.includes("image/avif");
  const extension = preferAvif ? "avif" : "webp";

  const posterPath = path.join(ENV.GALLERY_MEDIA_PATH, gallery.id as string, ".posters", mediaId, `${media.poster_revision}.${extension}`);

  let stats: fs.Stats;
  try {
    stats = fs.statSync(posterPath);
  } catch {
    return new Response("Not found", { status: 404, headers: GALLERY_PRIVATE_HEADERS });
  }

  const fileStream = fs.createReadStream(posterPath);
  const webStream = Readable.toWeb(fileStream) as ReadableStream;

  const headers = new Headers(GALLERY_PRIVATE_HEADERS);
  headers.set("Content-Type", `image/${extension}`);
  headers.set("Content-Length", stats.size.toString());
  headers.set("Vary", "Accept");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(webStream, {
    status: 200,
    headers,
  });
}
