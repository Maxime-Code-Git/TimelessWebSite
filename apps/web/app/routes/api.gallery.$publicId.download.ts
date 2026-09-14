import type { LoaderFunctionArgs } from "react-router";
import { getGallerySession } from "~/lib/gallery-auth.server";
import type { GalleryAccessLevel } from "~/lib/gallery-auth.server";
import { getGalleryDb } from "~/lib/gallery-db.server";
import { ENV } from "~/lib/env.server";
import fs from "node:fs";
import path from "node:path";
import yazl from "yazl";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const session = await getGallerySession(request);
  const galleryId = session.get("galleryId");
  const accessLevel = session.get("accessLevel") as GalleryAccessLevel | undefined;
  const codeVersion = session.get("codeVersion") as number | undefined;

  if (!galleryId || !accessLevel || codeVersion === undefined) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { publicId } = params;
  if (!publicId) return new Response("Bad Request", { status: 400 });

  const db = getGalleryDb();
  
  // Verify gallery & session match
  const gallery = db.prepare("SELECT * FROM galleries WHERE public_id = ?").get(publicId) as { id: string, status: string, expires_at: number, couple_code_version: number, guest_code_version: number, bride_names: string } | undefined;
  if (!gallery || gallery.id !== galleryId || gallery.status !== "published" || gallery.expires_at < Date.now()) {
    return new Response("Unauthorized", { status: 401 });
  }

  const currentVersion = accessLevel === "maries" ? gallery.couple_code_version : gallery.guest_code_version;
  if (codeVersion !== currentVersion) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Get media
  let media: Record<string, unknown>[];
  if (accessLevel === "maries") {
    media = db.prepare("SELECT * FROM gallery_media WHERE gallery_id = ?").all(galleryId) as Record<string, unknown>[];
  } else {
    media = db.prepare("SELECT * FROM gallery_media WHERE gallery_id = ? AND visibility = 'invites'").all(galleryId) as Record<string, unknown>[];
  }

  if (media.length === 0) {
    return new Response("No media to download", { status: 404 });
  }

  const zipfile = new yazl.ZipFile();
  const zipFileName = `Sempra-${gallery.bride_names.replace(/[^a-zA-Z0-9-]/g, "_")}.zip`;
  
  for (const m of media) {
    const filePath = path.join(ENV.GALLERY_MEDIA_PATH, gallery.id, m.id as string);
    if (fs.existsSync(filePath)) {
      zipfile.addFile(filePath, m.original_name as string);
    }
  }

  zipfile.end();

  return new Response(zipfile.outputStream as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFileName}"`,
    }
  });
}
