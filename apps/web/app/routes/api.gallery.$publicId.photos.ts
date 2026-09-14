import type { LoaderFunctionArgs } from "react-router";
import { requireGalleryAccess, GALLERY_PRIVATE_HEADERS } from "~/lib/gallery-auth.server";
import { getGalleryDb } from "~/lib/gallery-db.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { publicId } = params;
  if (!publicId) return new Response("Bad Request", { status: 400 });

  const url = new URL(request.url);
  const skip = parseInt(url.searchParams.get("skip") || "0", 10);
  const take = 24;

  if (isNaN(skip) || skip < 0) return new Response("Bad Request", { status: 400 });

  const { gallery, accessLevel } = await requireGalleryAccess(request, publicId);
  const db = getGalleryDb();

  let query = "SELECT * FROM gallery_media WHERE gallery_id = ? AND type = 'photo'";
  const queryParams: (string | number)[] = [gallery.id as string];

  if (accessLevel !== "maries") {
    query += " AND visibility = 'invites'";
  }

  query += " ORDER BY created_at ASC LIMIT ? OFFSET ?";
  queryParams.push(take, skip);

  const photos = db.prepare(query).all(...queryParams);

  return Response.json(photos, {
    headers: GALLERY_PRIVATE_HEADERS
  });
}
