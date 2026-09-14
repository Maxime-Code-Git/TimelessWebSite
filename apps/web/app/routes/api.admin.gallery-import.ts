import type { LoaderFunctionArgs } from "react-router";
import { requireValidAdminSession } from "../lib/admin-auth.server";
import { getGalleryImports } from "../lib/gallery.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireValidAdminSession(request);

  const url = new URL(request.url);
  const galleryId = url.searchParams.get("galleryId");
  if (!galleryId) return Response.json({ error: "Missing galleryId" }, { status: 400 });

  const imports = getGalleryImports(galleryId);
  return Response.json({ imports });
}
