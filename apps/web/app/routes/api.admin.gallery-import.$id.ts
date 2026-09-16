import type { LoaderFunctionArgs } from "react-router";
import { requireValidAdminSession, createAdminHeaders } from "~/lib/admin-auth.server";
import { getGalleryDb } from "~/lib/gallery-db.server";
import { getImportPreview, startGalleryImport } from "~/lib/gallery-import.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireValidAdminSession(request);
  const { id } = params;
  if (!id) return new Response("Bad Request", { status: 400, headers: createAdminHeaders() });

  const url = new URL(request.url);
  const previewFolder = url.searchParams.get("previewFolder");

  if (previewFolder) {
    try {
      const preview = await getImportPreview(previewFolder);
      return Response.json(preview, { headers: createAdminHeaders() });
    } catch (e: unknown) {
      return Response.json({ error: (e as Error).message }, { status: 400, headers: createAdminHeaders() });
    }
  }

  const db = getGalleryDb();
  const imports = db.prepare("SELECT * FROM gallery_imports WHERE gallery_id = ? ORDER BY created_at DESC LIMIT 1").get(id);

  return Response.json({ importState: imports || null }, { headers: createAdminHeaders() });
}

import { validateAdminFormData, ActionSecurityError } from "~/lib/admin-auth.server";

export async function action({ request, params }: LoaderFunctionArgs) {
  let formData: FormData;
  try {
    formData = await validateAdminFormData(request);
  } catch (err) {
    if (err instanceof ActionSecurityError) {
      return Response.json({ error: err.message }, { status: err.status, headers: createAdminHeaders() });
    }
    return Response.json({ error: "Requête invalide." }, { status: 400, headers: createAdminHeaders() });
  }

  const { id } = params;
  if (!id) return new Response("Bad Request", { status: 400, headers: createAdminHeaders() });

  const folderName = formData.get("folderName");

  if (!folderName || typeof folderName !== "string") {
    return new Response("Bad Request", { status: 400, headers: createAdminHeaders() });
  }

  try {
    const importId = startGalleryImport(id, folderName);
    return Response.json({ importId, status: "pending" }, { headers: createAdminHeaders() });
  } catch (e: unknown) {
    return Response.json({ error: (e as Error).message }, { status: 400, headers: createAdminHeaders() });
  }
}
