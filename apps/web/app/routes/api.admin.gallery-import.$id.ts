import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireValidAdminSession, createAdminHeaders, validateAdminFormData, ActionSecurityError } from "~/lib/admin-auth.server";
import { getGalleryDb } from "~/lib/gallery-db.server";
import {
  getImportPreview,
  startGalleryImport,
  getActiveImportInfo,
  isImportWorkerDisabled,
  scheduleWorker,
} from "~/lib/gallery-import.server";
import {
  getGalleryVideoPreviewStatus,
  type GalleryVideoPreviewStatus,
} from "~/lib/gallery-video-preview.server";

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
  interface ImportRow {
    id: string;
    gallery_id: string;
    status: string;
    progress: number;
    total: number;
    result_json: string | null;
    worker_id: string | null;
    lease_expires_at: number | null;
    attempt_count: number;
    created_at: number;
    updated_at: number;
  }
  const imports = db.prepare("SELECT * FROM gallery_imports WHERE gallery_id = ? ORDER BY created_at DESC LIMIT 1").get(id) as ImportRow | undefined;

  const workerDisabled = isImportWorkerDisabled();

  // Self-healing: if an import is pending or processing with an expired lease, wake up the worker
  if (imports && !workerDisabled) {
    const isPending = imports.status === "pending";
    const isExpiredLease = imports.status === "processing" && typeof imports.lease_expires_at === "number" && imports.lease_expires_at < Date.now();
    if (isPending || isExpiredLease) {
      scheduleWorker();
    }
  }

  // Video previews statuses for videos belonging to this gallery
  const videoRows = db.prepare("SELECT id FROM gallery_media WHERE gallery_id = ? AND type = 'video'").all(id) as { id: string }[];
  const videoPreviews: Record<string, GalleryVideoPreviewStatus> = {};
  for (const v of videoRows) {
    videoPreviews[v.id] = getGalleryVideoPreviewStatus(id, v.id);
  }

  return Response.json({
    importState: imports || null,
    activeInfo: getActiveImportInfo(id),
    workerDisabled,
    videoPreviews,
  }, { headers: createAdminHeaders() });
}

export async function action({ request, params }: ActionFunctionArgs) {
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
