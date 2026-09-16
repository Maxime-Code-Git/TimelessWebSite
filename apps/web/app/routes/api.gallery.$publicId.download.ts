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
  if (!publicId) return new Response("Bad Request", { status: 400, headers: GALLERY_PRIVATE_HEADERS });

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  if (typeParam !== "photos" && typeParam !== "videos" && typeParam !== "all") {
    return new Response("Bad Request", { status: 400, headers: GALLERY_PRIVATE_HEADERS });
  }

  const { gallery, accessLevel } = await requireGalleryAccess(request, publicId, undefined, true);
  const db = getGalleryDb();

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

  const media = db.prepare(query).all(...queryParams) as { id: string; original_name: string }[];

  if (media.length === 0) {
    return new Response("No media to download", { status: 404, headers: GALLERY_PRIVATE_HEADERS });
  }

  
  const filesToAdd: { filePath: string; safeName: string }[] = [];
  const usedNames = new Set<string>();

  for (const m of media) {
    const filePath = path.join(ENV.GALLERY_MEDIA_PATH, String(gallery.id), String(m.id));
    if (fs.existsSync(filePath)) {
      const rawName = m.original_name ? String(m.original_name) : "media";
      let safeName = path.basename(rawName).replace(/[\r\n]/g, "").replace(/[^\x20-\x7E]/g, "_").replace(/"/g, '');

      if (usedNames.has(safeName)) {
        const ext = path.extname(safeName);
        const name = path.basename(safeName, ext);
        let i = 1;
        while (usedNames.has(`${name}-${i}${ext}`)) i++;
        safeName = `${name}-${i}${ext}`;
      }
      usedNames.add(safeName);
      filesToAdd.push({ filePath, safeName });
    }
  }

  if (filesToAdd.length === 0) {
    return new Response("No valid files to download", { status: 404, headers: GALLERY_PRIVATE_HEADERS });
  }

  const zipfile = new yazl.ZipFile();
  const zipFileName = `Sempra-${String(gallery.bride_names).replace(/[^a-zA-Z0-9-]/g, "_")}.zip`;

  for (const f of filesToAdd) {
    zipfile.addFile(f.filePath, f.safeName);
  }

  zipfile.end();
// Wrap in Node.js Readable for proper .destroy() and .toWeb() support
  const nodeReadable = Readable.from(zipfile.outputStream as Readable);

  request.signal.addEventListener("abort", () => {
    nodeReadable.destroy();
  });

  const webStream = Readable.toWeb(nodeReadable);

  return new Response(webStream as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFileName}"`,
      ...GALLERY_PRIVATE_HEADERS
    }
  });
}
