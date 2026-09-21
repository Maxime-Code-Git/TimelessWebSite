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

  const { gallery, accessLevel } = await requireGalleryAccess(request, publicId, undefined, true);
  const db = getGalleryDb();

  let visCondition = " AND 1=0";
  if (accessLevel === "maries") {
    visCondition = " AND visibility IN ('invites', 'maries')";
  } else if (accessLevel === "invites") {
    visCondition = " AND visibility = 'invites'";
  }

  const countQuery = "SELECT COUNT(*) as total FROM gallery_media WHERE gallery_id = ? AND type = 'photo'" + visCondition;
  const galleryId = gallery.id as string;
  const totalRow = db.prepare(countQuery).get(galleryId) as { total: number };
  const total = totalRow.total;

  let query = "SELECT id, type, mime_type, width, height FROM gallery_media WHERE gallery_id = ? AND type = 'photo'" + visCondition;
  const queryParams: (string | number)[] = [gallery.id as string];

  query += " ORDER BY created_at ASC LIMIT ? OFFSET ?";
  queryParams.push(take, skip);

  const photos = db.prepare(query).all(...queryParams);

  return Response.json({ photos, total, hasMore: skip + photos.length < total }, {
    headers: GALLERY_PRIVATE_HEADERS
  });
}
