import type { LoaderFunctionArgs } from "react-router";
import { requireGalleryAccess, GALLERY_PRIVATE_HEADERS } from "~/lib/gallery-auth.server";
import { getGalleryDb } from "~/lib/gallery-db.server";
import { ENV } from "~/lib/env.server";
import fs from "node:fs";
import path from "node:path";
import yazl from "yazl";
import { Readable } from "node:stream";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { publicId } = params;
  if (!publicId) return new Response("Bad Request", { status: 400 });

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  if (typeParam !== "photos" && typeParam !== "videos" && typeParam !== "all") {
    return new Response("Bad Request", { status: 400 });
  }

  const { gallery, accessLevel } = await requireGalleryAccess(request, publicId, undefined, true);
  const db = getGalleryDb();

  // Get media
  let query = "SELECT * FROM gallery_media WHERE gallery_id = ?";
  const queryParams: string[] = [gallery.id as string];

  if (accessLevel !== "maries") {
    query += " AND visibility = 'invites'";
  }

  if (typeParam === "photos") {
    query += " AND type = 'photo'";
  } else if (typeParam === "videos") {
    query += " AND type = 'video'";
  }

  const media = db.prepare(query).all(...queryParams) as { id: string, original_name: string }[];

  if (media.length === 0) {
    return new Response("No media to download", { status: 404 });
  }

  const zipfile = new yazl.ZipFile();
  const zipFileName = `Sempra-${(gallery.bride_names as string).replace(/[^a-zA-Z0-9-]/g, "_")}.zip`;

  const usedNames = new Set<string>();

  for (const m of media) {
    const filePath = path.join(ENV.GALLERY_MEDIA_PATH, gallery.id as string, m.id);
    if (fs.existsSync(filePath)) {
      // Zip Slip protection: only keep the base name
      let safeName = path.basename(m.original_name || "media");

      // Handle duplicates
      if (usedNames.has(safeName)) {
        const ext = path.extname(safeName);
        const name = path.basename(safeName, ext);
        let i = 1;
        while (usedNames.has(`${name}-${i}${ext}`)) i++;
        safeName = `${name}-${i}${ext}`;
      }
      usedNames.add(safeName);

      zipfile.addFile(filePath, safeName);
    }
  }

  zipfile.end();

  if (usedNames.size === 0) {
    return new Response("No valid files to download", { status: 404 });
  }

  request.signal.addEventListener("abort", () => {
    zipfile.outputStream.destroy();
  });

  const webStream = Readable.toWeb(Readable.from(zipfile.outputStream)) as unknown as BodyInit;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFileName}"`,
      ...GALLERY_PRIVATE_HEADERS
    }
  });
}
