import { Form, Link, useActionData, useLoaderData, useRevalidator, useFetcher } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireValidAdminSession, validateAdminFormData, createAdminHeaders, ActionSecurityError } from "../lib/admin-auth.server";
import { getGalleryById, updateGallery, rotateGalleryCode, CodeCollisionError, getGalleryMediaStats, getGalleryImports } from "../lib/gallery.server";
import type { GalleryImportRow, GalleryMediaRow } from "../lib/gallery.server";
import { decryptGalleryCode, generateGalleryCode } from "../lib/gallery-auth.server";
import { getGalleryDb } from "../lib/gallery-db.server";
import { getAvailableImportFolders, type ActiveImportInfo } from "../lib/gallery-import.server";
import { ensureGalleryImportFolder } from "../lib/gallery-folder.server";
import {
  listGalleryVideoSources,
  deleteGalleryVideoSource,
  GalleryImportFileError,
  type GalleryVideoSource,
} from "../lib/gallery-import-files.server";
import {
  getGalleryVideoPreviewStatus,
  startGalleryVideoPreview,
  isGalleryVideoPreviewProcessing,
  type GalleryVideoPreviewStatus,
} from "../lib/gallery-video-preview.server";
import { GalleryBrowserUpload } from "../components/admin/GalleryBrowserUpload";
import styles from "./admin.module.css";
import { commitSession } from "../lib/session.server";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ENV } from "../lib/env.server";
import { useEffect, useState, useRef } from "react";
import { formatEuropeanDate } from "../lib/date";
export async function loader({ request, params }: LoaderFunctionArgs) {
  const session = await requireValidAdminSession(request);
  const gallery = getGalleryById(params.id!);
  if (!gallery) throw new Response("Gallery not found", { status: 404 });

  const stats = getGalleryMediaStats(gallery.id);
  const imports = getGalleryImports(gallery.id);

  const guestCode = decryptGalleryCode(gallery.guest_code_encrypted);
  const coupleCode = decryptGalleryCode(gallery.couple_code_encrypted);

  const headers = createAdminHeaders();
  let csrfToken = session.get("csrfToken") as string | undefined;
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    session.set("csrfToken", csrfToken);
    headers.set("Set-Cookie", await commitSession(session));
  }

  const galleryFolder = ensureGalleryImportFolder(gallery.id);
  const folders = getAvailableImportFolders();

  // Get gallery photos for cover selection
  const db = getGalleryDb();
  const allMedia = db.prepare(
    "SELECT id, type, visibility, original_name, width, height, poster_revision FROM gallery_media WHERE gallery_id = ? ORDER BY created_at ASC"
  ).all(gallery.id) as Pick<GalleryMediaRow, "id" | "type" | "visibility" | "original_name" | "width" | "height" | "poster_revision">[];

  const galleryPhotos = allMedia.filter(m => m.type === "photo");

  const videoSources = listGalleryVideoSources(galleryFolder.folderName);
  const videoPreviews: Record<string, GalleryVideoPreviewStatus> = {};
  for (const m of allMedia) {
    if (m.type === "video") {
      videoPreviews[m.id] = getGalleryVideoPreviewStatus(gallery.id, m.id);
    }
  }

  return Response.json({
    gallery,
    stats,
    imports,
    folders,
    galleryFolderName: galleryFolder.folderName,
    guestCode,
    coupleCode,
    csrfToken,
    allMedia,
    galleryPhotos,
    videoSources,
    videoPreviews,
  }, { headers });
}

export async function action({ request, params }: ActionFunctionArgs) {
  let formData: FormData;
  try {
    formData = await validateAdminFormData(request);
  } catch (err) {
    if (err instanceof ActionSecurityError) {
      return Response.json({ error: err.message, intent: "unknown" }, { status: err.status });
    }
    return Response.json({ error: "Requête invalide.", intent: "unknown" }, { status: 400 });
  }

  const intent = formData.get("intent") as string | null;
  const gallery = getGalleryById(params.id!);
  if (!gallery) return Response.json({ error: "Gallery not found", intent }, { status: 404 });

  if (intent === "update_info") {
    const bride_names = String(formData.get("bride_names")).trim();
    if (!bride_names || bride_names.length > 100) {
      return Response.json({ error: "Noms des mariés invalides (max 100 caractères).", intent }, { status: 400 });
    }

    const wedding_date = String(formData.get("wedding_date")).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(wedding_date)) {
      return Response.json({ error: "Date de mariage invalide.", intent }, { status: 400 });
    }

    const locationRaw = String(formData.get("location") || "").trim();
    if (locationRaw.length > 100) {
      return Response.json({ error: "Lieu invalide (max 100 caractères).", intent }, { status: 400 });
    }
    const location = locationRaw || null;

    const expiresStr = String(formData.get("expires_at") || "").trim();
    const expiresDate = new Date(expiresStr);
    if (!expiresStr || isNaN(expiresDate.getTime()) || expiresDate.getTime() < Date.now()) {
      return Response.json({ error: "Date d'expiration invalide ou dans le passé.", intent }, { status: 400 });
    }
    const expires_at = expiresDate.getTime();

    const statusRaw = String(formData.get("status"));
    if (statusRaw !== "draft" && statusRaw !== "published" && statusRaw !== "archived") {
      return Response.json({ error: "Statut invalide.", intent }, { status: 400 });
    }
    const status = statusRaw as "draft" | "published" | "archived";

    const parseOptionalText = (field: string, maxLen: number) => {
      const val = String(formData.get(field) || "").trim();
      if (val.length > maxLen) throw new Error(`${field} dépasse la longueur maximale de ${maxLen}.`);
      return val || null;
    };

    let intro_fr, intro_en, signature_fr, signature_en;
    try {
      intro_fr = parseOptionalText("intro_fr", 2000);
      intro_en = parseOptionalText("intro_en", 2000);
      signature_fr = parseOptionalText("signature_fr", 100);
      signature_en = parseOptionalText("signature_en", 100);
    } catch (err) {
      return Response.json({ error: (err as Error).message, intent }, { status: 400 });
    }

    const coverRaw = String(formData.get("cover_image_id") || "").trim();
    const cover_image_id = coverRaw || null;

    if (status === "published") {
      const stats = getGalleryMediaStats(gallery.id);
      if (stats.invitesPhotos === 0 && stats.invitesVideos === 0 && stats.mariesPhotos === 0 && stats.mariesVideos === 0) {
        return Response.json({ error: "Une galerie ne peut pas être publiée sans média valide.", intent }, { status: 400 });
      }

      const pendingImports = getGalleryImports(gallery.id).filter(i => i.status === "pending" || i.status === "processing");
      if (pendingImports.length > 0) {
        return Response.json({ error: "Une galerie ne peut pas être publiée si un import est en cours.", intent }, { status: 400 });
      }

      if (cover_image_id) {
        const db = getGalleryDb();
        const checkCover = db.prepare("SELECT id, type FROM gallery_media WHERE id = ? AND gallery_id = ?").get(cover_image_id, gallery.id) as { id: string; type: string } | undefined;
        if (!checkCover) {
          return Response.json({ error: "L'image de couverture choisie est invalide ou n'appartient pas à cette galerie.", intent }, { status: 400 });
        }
        if (checkCover.type !== "photo") {
          return Response.json({ error: "La couverture doit être une photo, pas une vidéo.", intent }, { status: 400 });
        }
      }
    }

    updateGallery(gallery.id, {
      bride_names,
      wedding_date,
      location,
      expires_at,
      status,
      intro_fr,
      intro_en,
      signature_fr,
      signature_en,
      cover_image_id
    });
    return Response.json({ success: true, intent });
  }

  if (intent === "rotate_guest_code") {
    const guestCode = String(formData.get("guestCode") || "").trim();
    if (!guestCode || guestCode.length < 8) {
      return Response.json({ error: "Le code doit faire au moins 8 caractères.", intent }, { status: 400 });
    }
    try {
      rotateGalleryCode(gallery.id, "invites", guestCode);
      return Response.json({ success: true, intent });
    } catch (err) {
      if (err instanceof CodeCollisionError) {
        return Response.json({ error: "Ce code est déjà utilisé ailleurs.", intent }, { status: 409 });
      }
      return Response.json({ error: "Erreur lors de la mise à jour du code.", intent }, { status: 500 });
    }
  }

  if (intent === "rotate_couple_code") {
    const coupleCode = String(formData.get("coupleCode") || "").trim();
    if (!coupleCode || coupleCode.length < 8) {
      return Response.json({ error: "Le code doit faire au moins 8 caractères.", intent }, { status: 400 });
    }
    try {
      rotateGalleryCode(gallery.id, "maries", coupleCode);
      return Response.json({ success: true, intent });
    } catch (err) {
      if (err instanceof CodeCollisionError) {
        return Response.json({ error: "Ce code est déjà utilisé ailleurs.", intent }, { status: 409 });
      }
      return Response.json({ error: "Erreur lors de la mise à jour du code.", intent }, { status: 500 });
    }
  }

  if (intent === "regenerate_guest_code") {
    for (let attempts = 0; attempts < 5; attempts++) {
      try {
        rotateGalleryCode(gallery.id, "invites", generateGalleryCode());
        return Response.json({ success: true, intent });
      } catch (err) {
        if (!(err instanceof CodeCollisionError)) {
          return Response.json({ error: "Erreur lors de la génération.", intent }, { status: 500 });
        }
      }
    }
    return Response.json({ error: "Impossible de générer un code unique.", intent }, { status: 500 });
  }

  if (intent === "regenerate_couple_code") {
    for (let attempts = 0; attempts < 5; attempts++) {
      try {
        rotateGalleryCode(gallery.id, "maries", generateGalleryCode());
        return Response.json({ success: true, intent });
      } catch (err) {
        if (!(err instanceof CodeCollisionError)) {
          return Response.json({ error: "Erreur lors de la génération.", intent }, { status: 500 });
        }
      }
    }
    return Response.json({ error: "Impossible de générer un code unique.", intent }, { status: 500 });
  }

  if (intent === "generate_video_preview") {
    const mediaId = String(formData.get("mediaId") || "").trim();
    if (!mediaId) {
      return Response.json({ error: "Identifiant de média manquant.", intent }, { status: 400 });
    }
    const result = startGalleryVideoPreview(gallery.id, mediaId);
    if (result === "not_found") {
      return Response.json({ error: "Vidéo introuvable dans cette galerie.", intent }, { status: 404 });
    }
    if (result === "busy") {
      return Response.json({
        error: "Un autre aperçu vidéo est déjà en cours de génération sur le serveur. Réessayez une fois le traitement terminé.",
        intent,
      }, { status: 409 });
    }
    const success = result === "ready"
      ? "L'aperçu vidéo est déjà disponible."
      : "Génération de l'aperçu vidéo lancée en arrière-plan. Le fichier original reste intact.";
    return Response.json({ success, intent }, { status: result === "ready" ? 200 : 202 });
  }

  if (intent === "delete_video_source") {
    const sourceName = String(formData.get("sourceName") || "").trim();
    const category = String(formData.get("category") || "").trim();
    const sourceVersion = String(formData.get("sourceVersion") || "").trim();

    try {
      deleteGalleryVideoSource(gallery.id, category, sourceName, sourceVersion);
      return Response.json({
        success: `Le fichier source « ${sourceName} » a été supprimé du Mac mini. Sa copie déjà importée dans la galerie reste disponible.`,
        intent,
      });
    } catch (err: unknown) {
      if (err instanceof GalleryImportFileError) {
        return Response.json({ error: err.message, intent }, { status: err.status });
      }
      return Response.json({
        error: err instanceof Error ? err.message : "Erreur lors de la suppression de la source.",
        intent,
      }, { status: 500 });
    }
  }

  if (intent === "delete_media") {
    const mediaIds = [...new Set(formData.getAll("mediaIds").map(String))];
    if (!mediaIds || mediaIds.length === 0) {
      return Response.json({ error: "Aucun média sélectionné.", intent }, { status: 400 });
    }
    if (mediaIds.length > 1000) {
      return Response.json({ error: "Impossible de supprimer plus de 1000 médias à la fois.", intent }, { status: 400 });
    }

    const pendingImports = getGalleryImports(gallery.id).filter(i => i.status === "pending" || i.status === "processing");
    if (pendingImports.length > 0) {
      return Response.json({ error: "Une galerie ne peut pas être modifiée si un import est en cours.", intent }, { status: 400 });
    }

    for (const id of mediaIds) {
      if (isGalleryVideoPreviewProcessing(gallery.id, id)) {
        return Response.json({
          error: "Un aperçu vidéo est en cours de génération pour ce média. Suppression impossible pour le moment.",
          intent,
        }, { status: 409 });
      }
    }

    const db = getGalleryDb();
    const placeholders = mediaIds.map(() => '?').join(',');
    const validMedia = db.prepare(`SELECT id, type FROM gallery_media WHERE gallery_id = ? AND id IN (${placeholders})`).all(gallery.id, ...mediaIds) as { id: string }[];

    if (validMedia.length !== mediaIds.length) {
      return Response.json({ error: "Certains médias n'appartiennent pas à cette galerie ou sont introuvables.", intent }, { status: 400 });
    }

    const validMediaIds = validMedia.map(m => m.id);

    const mediaDir = path.join(ENV.GALLERY_MEDIA_PATH, gallery.id);
    const quarantineDir = path.join(mediaDir, '.quarantine', crypto.randomUUID());

    if (!fs.existsSync(quarantineDir)) {
      fs.mkdirSync(quarantineDir, { recursive: true });
    }

    const quarantined: string[] = [];
    const quarantinedPosters: string[] = [];
    const quarantinedPreviews: string[] = [];

    try {
      for (const id of validMediaIds) {
        const src = path.join(mediaDir, id);
        const dest = path.join(quarantineDir, id);
        if (fs.existsSync(src)) {
          fs.renameSync(src, dest);
          quarantined.push(id);
        }

        const posterSrc = path.join(mediaDir, ".posters", id);
        const posterDest = path.join(quarantineDir, ".posters_" + id);
        if (fs.existsSync(posterSrc)) {
          fs.renameSync(posterSrc, posterDest);
          quarantinedPosters.push(id);
        }

        const previewSrc = path.join(mediaDir, ".previews", id);
        const previewDest = path.join(quarantineDir, ".previews_" + id);
        if (fs.existsSync(previewSrc)) {
          fs.renameSync(previewSrc, previewDest);
          quarantinedPreviews.push(id);
        }
      }

      db.exec('BEGIN TRANSACTION');
      try {
        db.prepare(`DELETE FROM gallery_media WHERE gallery_id = ? AND id IN (${placeholders})`).run(gallery.id, ...mediaIds);

        if (gallery.cover_image_id && validMediaIds.includes(gallery.cover_image_id)) {
          db.prepare("UPDATE galleries SET cover_image_id = NULL WHERE id = ?").run(gallery.id);
        }

        if (gallery.status === "published") {
          const count = (db.prepare("SELECT COUNT(*) as c FROM gallery_media WHERE gallery_id = ?").get(gallery.id) as { c: number }).c;
          if (count === 0) {
            db.prepare("UPDATE galleries SET status = 'draft' WHERE id = ?").run(gallery.id);
          }
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }

      for (const id of quarantined) {
        try { fs.unlinkSync(path.join(quarantineDir, id)); } catch { /* ignore */ }
      }
      for (const id of quarantinedPosters) {
        try { fs.rmSync(path.join(quarantineDir, ".posters_" + id), { recursive: true, force: true }); } catch { /* ignore */ }
      }
      for (const id of quarantinedPreviews) {
        try { fs.rmSync(path.join(quarantineDir, ".previews_" + id), { recursive: true, force: true }); } catch { /* ignore */ }
      }
      try { fs.rmdirSync(quarantineDir); } catch { /* ignore */ }

      return Response.json({ success: true, intent, deletedCount: validMediaIds.length });
    } catch {
      for (const id of quarantined) {
        const src = path.join(quarantineDir, id);
        const dest = path.join(mediaDir, id);
        try { if (fs.existsSync(src)) fs.renameSync(src, dest); } catch { /* ignore */ }
      }
      for (const id of quarantinedPosters) {
        const src = path.join(quarantineDir, ".posters_" + id);
        const dest = path.join(mediaDir, ".posters", id);
        try {
          if (fs.existsSync(src)) {
            if (!fs.existsSync(path.join(mediaDir, ".posters"))) fs.mkdirSync(path.join(mediaDir, ".posters"), { recursive: true });
            fs.renameSync(src, dest);
          }
        } catch { /* ignore */ }
      }
      for (const id of quarantinedPreviews) {
        const src = path.join(quarantineDir, ".previews_" + id);
        const dest = path.join(mediaDir, ".previews", id);
        try {
          if (fs.existsSync(src)) {
            if (!fs.existsSync(path.join(mediaDir, ".previews"))) fs.mkdirSync(path.join(mediaDir, ".previews"), { recursive: true });
            fs.renameSync(src, dest);
          }
        } catch { /* ignore */ }
      }

      try { fs.rmdirSync(quarantineDir); } catch { /* ignore */ }
      return Response.json({ error: "Erreur lors de la suppression.", intent }, { status: 500 });
    }
  }

  return Response.json({ error: "Intent inconnu.", intent }, { status: 400 });
}

interface ActionData {
  error?: string;
  success?: boolean | string;
  intent?: string;
  deletedCount?: number;
}

interface LoaderData {
  gallery: {
    id: string;
    public_id: string;
    bride_names: string;
    wedding_date: string;
    location: string | null;
    intro_fr: string | null;
    intro_en: string | null;
    signature_fr: string | null;
    signature_en: string | null;
    expires_at: number;
    status: string;
    cover_image_id: string | null;
  };
  stats: { invitesPhotos: number; invitesVideos: number; mariesPhotos: number; mariesVideos: number };
  imports: GalleryImportRow[];
  folders: string[];
  galleryFolderName: string;
  guestCode: string;
  coupleCode: string;
  csrfToken: string;
  allMedia: { id: string; type: string; visibility: string; original_name: string; width: number | null; height: number | null; poster_revision: string | null }[];
  galleryPhotos: { id: string; original_name: string; width: number | null; height: number | null }[];
  videoSources: GalleryVideoSource[];
  videoPreviews: Record<string, GalleryVideoPreviewStatus>;
}

type ImportActionData = {
  importId?: string;
  status?: "pending";
  error?: string;
};

function getAdminPhotoPreviewUrl(publicId: string, mediaId: string, width: number): string {
  return `/api/gallery/${publicId}/media/${mediaId}?width=${width}&format=webp`;
}

function formatFileSize(bytes: number): string {
  if (!bytes || isNaN(bytes)) return "0 o";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

export default function AdminGalleryEdit() {
  const {
    gallery,
    stats,
    imports,
    folders,
    galleryFolderName,
    guestCode,
    coupleCode,
    csrfToken,
    galleryPhotos,
    allMedia,
    videoSources = [],
    videoPreviews = {},
  } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const revalidator = useRevalidator();
  const importFetcher = useFetcher<ImportActionData>();
  const deleteFetcher = useFetcher<ActionData>();
  const sourceFetcher = useFetcher<ActionData>();
  const previewFetcher = useFetcher<ActionData>();

  // Live import & preview tracking state
  const [liveImportState, setLiveImportState] = useState<GalleryImportRow | null>(
    imports.length > 0 ? imports[0] : null
  );
  const [liveActiveInfo, setLiveActiveInfo] = useState<ActiveImportInfo | null>(null);
  const [workerDisabled, setWorkerDisabled] = useState<boolean>(false);
  const [liveVideoPreviews, setLiveVideoPreviews] = useState<Record<string, GalleryVideoPreviewStatus>>(videoPreviews || {});

  // Update live state when fresh loader data arrives
  useEffect(() => {
    if (imports.length > 0) {
      setLiveImportState(imports[0]);
    }
  }, [imports]);

  useEffect(() => {
    if (videoPreviews) {
      setLiveVideoPreviews(videoPreviews);
    }
  }, [videoPreviews]);

  // Check if background work is in progress
  const isImportActive = liveImportState?.status === "pending" || liveImportState?.status === "processing";
  const isPreviewActive = Object.values(liveVideoPreviews).some(p => p?.state === "processing");
  const isBackgroundBusy = isImportActive || isPreviewActive;

  // Real-time polling without resetting active form inputs
  useEffect(() => {
    if (!isBackgroundBusy) return;

    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/gallery-import/${gallery.id}`);
        if (!res.ok || stopped) return;
        const data = await res.json();
        if (stopped) return;

        if (data.workerDisabled !== undefined) {
          setWorkerDisabled(Boolean(data.workerDisabled));
        }

        if (data.importState) {
          const prevStatus = liveImportState?.status;
          const newStatus = data.importState.status;
          setLiveImportState(data.importState);
          setLiveActiveInfo(data.activeInfo || null);

          // If job finished, trigger ONE revalidation to refresh media grid & stats
          if ((prevStatus === "pending" || prevStatus === "processing") &&
              (newStatus === "completed" || newStatus === "failed")) {
            revalidator.revalidate();
          }
        }

        if (data.videoPreviews) {
          const wasProcessing = Object.values(liveVideoPreviews).some(p => p?.state === "processing");
          const previewsRecord = data.videoPreviews as Record<string, GalleryVideoPreviewStatus>;
          const stillProcessing = Object.values(previewsRecord).some(p => p?.state === "processing");
          setLiveVideoPreviews(previewsRecord);

          if (wasProcessing && !stillProcessing) {
            revalidator.revalidate();
          }
        }
      } catch {
        // network error, retry next interval
      }
    };

    const interval = setInterval(poll, 1500);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [isBackgroundBusy, gallery.id, liveImportState?.status, liveVideoPreviews, revalidator]);

  const [confirmDeleteSingleMedia, setConfirmDeleteSingleMedia] = useState<{ id: string; original_name: string } | null>(null);
  const [confirmDeleteSource, setConfirmDeleteSource] = useState<string | null>(null);

  useEffect(() => {
    if (sourceFetcher.data?.success) {
      setConfirmDeleteSource(null);
    }
  }, [sourceFetcher.data]);

  const [showCodes, setShowCodes] = useState(false);
  const [previewData, setPreviewData] = useState<{
    error?: string;
    total?: number;
    invitesPhotosCount?: number;
    invitesVideosCount?: number;
    mariesPhotosCount?: number;
    mariesVideosCount?: number;
    rejected?: { file: string; reason: string }[];
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState("");

  const [mediaFilter, setMediaFilter] = useState<"all" | "invites-photo" | "invites-video" | "maries-photo" | "maries-video">("all");
  const [selectedMedia, setSelectedMedia] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const filteredMedia = (allMedia || []).filter(m => {
    if (mediaFilter === "all") return true;
    if (mediaFilter === "invites-photo") return m.visibility === "invites" && m.type === "photo";
    if (mediaFilter === "invites-video") return m.visibility === "invites" && m.type === "video";
    if (mediaFilter === "maries-photo") return m.visibility === "maries" && m.type === "photo";
    if (mediaFilter === "maries-video") return m.visibility === "maries" && m.type === "video";
    return true;
  });

  const [hideDeleteMessages, setHideDeleteMessages] = useState(false);

  useEffect(() => {
    if (deleteFetcher.state !== "idle") {
      setHideDeleteMessages(false);
    }
  }, [deleteFetcher.state]);

  const toggleMediaSelection = (id: string) => {
    const next = new Set(selectedMedia);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedMedia(next);
  };

  const toggleSelectAllFiltered = () => {
    if (selectedMedia.size === filteredMedia.length && filteredMedia.length > 0) {
      setSelectedMedia(new Set());
    } else {
      setSelectedMedia(new Set(filteredMedia.map(m => m.id)));
    }
  };

  useEffect(() => {
    if (deleteFetcher.data?.success && deleteFetcher.data?.intent === "delete_media") {
      setSelectedMedia(new Set());
      setShowDeleteModal(false);
      setConfirmDeleteSingleMedia(null);
    }
  }, [deleteFetcher.data]);

  const importBusy = importFetcher.state !== "idle" || isImportActive;
  const deleteBusy = deleteFetcher.state !== "idle";

  const loadPreview = async (folder: string) => {
    if (!folder) { setPreviewData(null); return; }
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/gallery-import/${gallery.id}?previewFolder=${encodeURIComponent(folder)}`);
      if (res.ok) {
        setPreviewData(await res.json());
      } else {
        const err = await res.json();
        setPreviewData({ error: err.error || "Erreur" });
      }
    } catch {
      setPreviewData({ error: "Erreur réseau" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  };

  const intentMsg = (target: string) => {
    if (!actionData || actionData.intent !== target) return null;
    if (actionData.error) return <p className={styles.errorText} role="alert">{actionData.error}</p>;
    if (actionData.success) return <p className={styles.successMessage} role="status">Enregistré.</p>;
    return null;
  };

  return (
    <div className={styles.adminPage}>
      {/* ── Sticky Parallax Header ── */}
      <header className={styles.galleryHeaderParallax}>
        <div className={styles.galleryHeaderLeft}>
          <div className={styles.galleryHeaderTitleRow}>
            <Link to="/admin/galleries" className={styles.backLink}>
              ← Galeries
            </Link>
            <h1 className={styles.galleryHeaderTitle}>{gallery.bride_names}</h1>
            <span
              className={`${styles.statusPill} ${
                gallery.status === "published"
                  ? styles.statusPillPublished
                  : gallery.status === "draft"
                  ? styles.statusPillDraft
                  : styles.statusPillArchived
              }`}
            >
              {gallery.status === "published" ? "Publiée" : gallery.status === "draft" ? "Brouillon" : "Archivée"}
            </span>
          </div>
          <div className={styles.galleryHeaderMeta}>
            <span>Mariage du {formatEuropeanDate(gallery.wedding_date, "fr")}</span>
            {gallery.location && <span>· {gallery.location}</span>}
            <span>· ID Public : <code>{gallery.public_id}</code></span>
          </div>
        </div>

        <div className={styles.galleryHeaderActions}>
          <a
            href={`/galerie/${gallery.public_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.button}
            title="Ouvrir la galerie telle que vue par les clients"
          >
            Voir côté client ↗
          </a>

          {gallery.status === "published" ? (
            <Form method="post">
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="intent" value="update_info" />
              <input type="hidden" name="bride_names" value={gallery.bride_names} />
              <input type="hidden" name="wedding_date" value={gallery.wedding_date} />
              <input type="hidden" name="expires_at" value={new Date(gallery.expires_at).toISOString().split("T")[0]} />
              <input type="hidden" name="status" value="draft" />
              <button type="submit" className={styles.button}>
                Passer en brouillon
              </button>
            </Form>
          ) : (
            <Form method="post">
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="intent" value="update_info" />
              <input type="hidden" name="bride_names" value={gallery.bride_names} />
              <input type="hidden" name="wedding_date" value={gallery.wedding_date} />
              <input type="hidden" name="expires_at" value={new Date(gallery.expires_at).toISOString().split("T")[0]} />
              <input type="hidden" name="status" value="published" />
              <button type="submit" className={styles.submitButton}>
                Publier la galerie
              </button>
            </Form>
          )}
        </div>
      </header>

      {/* ── Audience Metrics Grid ── */}
      <section className={styles.metricsGrid} aria-label="Compteurs médias">
        <div className={styles.metricCardItem}>
          <span className={styles.metricCardLabel}>Total Médias</span>
          <span className={styles.metricCardValue}>{allMedia.length}</span>
          <span className={styles.metricCardSubtitle}>Photos et vidéos cumulées</span>
        </div>
        <div className={styles.metricCardItem}>
          <span className={styles.metricCardLabel}>Espace Invités</span>
          <span className={styles.metricCardValue}>{stats.invitesPhotos + stats.invitesVideos}</span>
          <span className={styles.metricCardSubtitle}>{stats.invitesPhotos} photo(s) · {stats.invitesVideos} vidéo(s)</span>
        </div>
        <div className={styles.metricCardItem}>
          <span className={styles.metricCardLabel}>Espace Mariés (Privé)</span>
          <span className={styles.metricCardValue}>{stats.mariesPhotos + stats.mariesVideos}</span>
          <span className={styles.metricCardSubtitle}>{stats.mariesPhotos} photo(s) · {stats.mariesVideos} vidéo(s)</span>
        </div>
        <div className={styles.metricCardItem}>
          <span className={styles.metricCardLabel}>Date d'expiration</span>
          <span className={styles.metricCardValue} style={{ fontSize: "1.25rem" }}>
            {formatEuropeanDate(new Date(gallery.expires_at).toISOString().split("T")[0], "fr")}
          </span>
          <span className={styles.metricCardSubtitle}>
            {gallery.expires_at > Date.now() ? "Galerie active" : "Expirée"}
          </span>
        </div>
      </section>

      {/* ── Section: Téléversement et Importation de Médias ── */}
      <section className={styles.adminCardParallax}>
        <div className={styles.adminCardParallaxHeader}>
          <div>
            <h2 className={styles.adminCardParallaxTitle}>Téléversement & Importation de médias</h2>
            <p className={styles.adminCardParallaxSubtitle}>
              Transférez des photos ou des vidéos depuis votre navigateur vers le Mac mini, ou lancez l'importation d'un dossier.
            </p>
          </div>
        </div>

        {/* Worker disabled warning */}
        {workerDisabled && (
          <div className={styles.workerDisabledWarning} role="alert">
            <div>
              <strong>Worker d'importation désactivé :</strong> La variable d'environnement <code>__TEST_DISABLE_WORKER=true</code> est active. Les tâches d'importation resteront en attente tant que le worker n'est pas activé.
            </div>
          </div>
        )}

        {/* Real-time Operation Tracker (Browser -> Server -> Gallery) */}
        {isImportActive && liveImportState && (
          <div className={styles.operationTracker} role="status" aria-live="polite">
            <div className={styles.operationTrackerHeader}>
              <span className={styles.operationTrackerPhase}>
                {liveImportState.status === "pending"
                  ? "⏳ En attente de prise en charge par le worker d'importation..."
                  : `⚙️ ${liveActiveInfo?.phaseDetail || "Importation et traitement en cours..."}`}
              </span>
              {liveImportState.total > 0 && (
                <span className={styles.helperText}>
                  {liveImportState.progress} / {liveImportState.total} fichier(s) traité(s)
                </span>
              )}
            </div>

            {liveImportState.status === "processing" && liveImportState.total > 0 ? (
              <div className={styles.operationProgressBar}>
                <div
                  className={styles.operationProgressFill}
                  style={{
                    width: `${Math.min(100, Math.round(((liveImportState.progress || 0) / (liveImportState.total || 1)) * 100))}%`,
                  }}
                />
              </div>
            ) : (
              <div className={styles.operationProgressIndeterminate} />
            )}

            {liveActiveInfo?.currentFile && (
              <p className={styles.helperText} style={{ marginTop: "0.5rem", marginBottom: 0 }}>
                Fichier en cours : <strong>{liveActiveInfo.currentFile}</strong>
              </p>
            )}
          </div>
        )}

        {/* Browser Chunked Upload Component */}
        <GalleryBrowserUpload
          galleryId={gallery.id}
          csrfToken={csrfToken}
          galleryFolderName={galleryFolderName}
          onUploadBatchComplete={(folderName) => {
            setSelectedFolder(folderName);
            void loadPreview(folderName);
          }}
        />

        {/* Folder analysis preview box */}
        {previewLoading && (
          <p className={styles.helperText} style={{ marginTop: "1rem" }}>
            Analyse du dossier en cours...
          </p>
        )}

        {previewData && !previewLoading && (
          <div className={`${styles.previewBox} ${previewData.error ? styles.previewBoxError : ""}`} style={{ marginTop: "1rem" }}>
            {previewData.error ? (
              <p className={styles.errorText}>{previewData.error}</p>
            ) : (
              <div>
                <p><strong>{previewData.total} médias trouvés :</strong></p>
                <ul className={styles.previewList}>
                  <li>Invités : {previewData.invitesPhotosCount} photos, {previewData.invitesVideosCount} vidéos</li>
                  <li>Mariés : {previewData.mariesPhotosCount} photos, {previewData.mariesVideosCount} vidéos</li>
                </ul>
                {(previewData.rejected as { file: string; reason: string }[])?.length > 0 && (
                  <details style={{ marginTop: "0.5rem" }}>
                    <summary>Fichiers refusés ({(previewData.rejected as { file: string; reason: string }[]).length})</summary>
                    <ul>
                      {(previewData.rejected as { file: string; reason: string }[]).map((r, i) => (
                        <li key={i}>{r.file} - {r.reason}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        {importFetcher.data?.error && (
          <p
            role="alert"
            data-testid="gallery-import-error"
            className={`${styles.errorText} ${styles.marginTop16}`}
          >
            {importFetcher.data.error}
          </p>
        )}

        {importFetcher.data?.status === "pending" && (
          <p
            role="status"
            data-testid="gallery-import-status"
            className={`${styles.successMessage} ${styles.marginTop16}`}
          >
            Import lancé.
          </p>
        )}

        {/* Launch Import Button from selected folder */}
        <div style={{ marginTop: "1.25rem", display: "flex", gap: "1rem", alignItems: "center" }}>
          <importFetcher.Form
            method="post"
            action={`/api/admin/gallery-import/${gallery.id}`}
            encType="application/x-www-form-urlencoded"
          >
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="folderName" value={selectedFolder || galleryFolderName} />

            <button
              type="submit"
              className={styles.submitButton}
              disabled={importBusy}
            >
              {importBusy ? "Import en cours..." : "Confirmer et lancer l'import"}
            </button>
          </importFetcher.Form>
        </div>

        {/* Advanced Folder Selection */}
        <details className={styles.marginTop16}>
          <summary className={styles.label}>
            Importation depuis un dossier contrôlé (méthode avancée)
          </summary>
          <div className={styles.formGroup} style={{ marginTop: "0.75rem" }}>
            <label className={styles.label} htmlFor="import_folder">Dossier d'import sur le serveur</label>
            <select
              id="import_folder"
              className={styles.input}
              value={selectedFolder}
              onChange={e => {
                setSelectedFolder(e.target.value);
                void loadPreview(e.target.value);
              }}
            >
              <option value="">Dossier par défaut ({galleryFolderName})</option>
              {folders.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        </details>
      </section>

      {/* ── Section: Fichiers Sources Vidéo sur le Mac mini (Dossier d'import) ── */}
      <section className={styles.adminCardParallax}>
        <div className={styles.adminCardParallaxHeader}>
          <div>
            <h2 className={styles.adminCardParallaxTitle}>
              Fichiers sources vidéo sur le Mac mini ({videoSources.length})
            </h2>
            <p className={styles.adminCardParallaxSubtitle}>
              Dossier <code>{galleryFolderName}</code>. Ces fichiers sont les vidéos brutes stockées sur le disque local du Mac mini. La suppression d'un fichier source ici libère l'espace disque sans affecter sa copie déjà importée et publiée dans la galerie.
            </p>
          </div>
        </div>

        {sourceFetcher.data?.error && (
          <p role="alert" className={`${styles.errorText} ${styles.marginTop8}`}>
            {sourceFetcher.data.error}
          </p>
        )}
        {sourceFetcher.data?.success && (
          <p role="status" className={`${styles.successMessage} ${styles.marginTop8}`}>
            {String(sourceFetcher.data.success)}
          </p>
        )}

        {videoSources.length === 0 ? (
          <p className={styles.helperText}>
            Aucun fichier vidéo source présent dans le dossier d'import du Mac mini pour cette galerie.
          </p>
        ) : (
          <div className={styles.sourceVideoList}>
            {videoSources.map((src) => {
              const isConfirming = confirmDeleteSource === `${src.category}:${src.name}`;
              return (
                <div key={`${src.category}:${src.name}`} className={styles.sourceVideoCard} data-testid="source-video-item">
                  <div className={styles.sourceVideoHeader}>
                    <div>
                      <strong>🎬 {src.name}</strong>
                      <span className={src.category.includes("maries") ? styles.audienceBadgeMaries : styles.audienceBadgeInvites} style={{ marginLeft: 8 }}>
                        {src.categoryLabel}
                      </span>
                    </div>
                    <span className={styles.helperText}>{formatFileSize(src.size)}</span>
                  </div>

                  {isConfirming ? (
                    <div className={styles.sourceVideoConfirmBox}>
                      <p><strong>Confirmer la suppression du Mac mini :</strong> {src.name} ({src.categoryLabel})</p>
                      <p className={styles.helperText}>
                        Le fichier source sera supprimé du disque. La vidéo publiée dans la galerie (si déjà importée) reste disponible.
                      </p>
                      <div className={styles.sourceVideoActions}>
                        <sourceFetcher.Form method="post">
                          <input type="hidden" name="csrfToken" value={csrfToken} />
                          <input type="hidden" name="intent" value="delete_video_source" />
                          <input type="hidden" name="sourceName" value={src.name} />
                          <input type="hidden" name="category" value={src.category} />
                          <input type="hidden" name="sourceVersion" value={src.version} />
                          <button
                            type="submit"
                            className={styles.buttonDanger}
                            disabled={sourceFetcher.state !== "idle"}
                          >
                            {sourceFetcher.state !== "idle" ? "Suppression..." : "Supprimer définitivement du Mac mini"}
                          </button>
                        </sourceFetcher.Form>
                        <button
                          type="button"
                          className={styles.button}
                          onClick={() => setConfirmDeleteSource(null)}
                          disabled={sourceFetcher.state !== "idle"}
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.sourceVideoActions}>
                      <button
                        type="button"
                        className={styles.buttonDanger}
                        onClick={() => setConfirmDeleteSource(`${src.category}:${src.name}`)}
                        disabled={sourceFetcher.state !== "idle"}
                      >
                        Supprimer du Mac mini
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section: Médias Importés dans la Galerie ── */}
      <section className={styles.adminCardParallax}>
        <div className={styles.adminCardParallaxHeader}>
          <div>
            <h2 className={styles.adminCardParallaxTitle}>
              Médias de la galerie ({allMedia.length})
            </h2>
            <p className={styles.adminCardParallaxSubtitle}>
              Ces médias sont importés et accessibles aux invités ou aux mariés selon leur visibilité. Supprimer un média ici le retire de la galerie.
            </p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className={styles.filterTabsRow} role="tablist" aria-label="Filtrer les médias">
          <button
            type="button"
            className={`${styles.filterTabButton} ${mediaFilter === "all" ? styles.filterTabButtonActive : ""}`}
            onClick={() => { setMediaFilter("all"); setSelectedMedia(new Set()); }}
          >
            Tous ({allMedia.length})
          </button>
          <button
            type="button"
            className={`${styles.filterTabButton} ${mediaFilter === "invites-photo" ? styles.filterTabButtonActive : ""}`}
            onClick={() => { setMediaFilter("invites-photo"); setSelectedMedia(new Set()); }}
          >
            Photos Invités ({stats.invitesPhotos})
          </button>
          <button
            type="button"
            className={`${styles.filterTabButton} ${mediaFilter === "invites-video" ? styles.filterTabButtonActive : ""}`}
            onClick={() => { setMediaFilter("invites-video"); setSelectedMedia(new Set()); }}
          >
            Vidéos Invités ({stats.invitesVideos})
          </button>
          <button
            type="button"
            className={`${styles.filterTabButton} ${mediaFilter === "maries-photo" ? styles.filterTabButtonActive : ""}`}
            onClick={() => { setMediaFilter("maries-photo"); setSelectedMedia(new Set()); }}
          >
            Photos Mariés ({stats.mariesPhotos})
          </button>
          <button
            type="button"
            className={`${styles.filterTabButton} ${mediaFilter === "maries-video" ? styles.filterTabButtonActive : ""}`}
            onClick={() => { setMediaFilter("maries-video"); setSelectedMedia(new Set()); }}
          >
            Vidéos Mariés ({stats.mariesVideos})
          </button>
        </div>

        {/* Bulk Selection Actions */}
        <div className={styles.flexGroup} style={{ marginBottom: "1.25rem" }}>
          <button type="button" onClick={toggleSelectAllFiltered} className={styles.button}>
            {filteredMedia.length > 0 && filteredMedia.every(media => selectedMedia.has(media.id))
              ? "Désélectionner tout"
              : "Sélectionner tout"}
          </button>
          {selectedMedia.size > 0 && (
            <button type="button" onClick={() => setShowDeleteModal(true)} className={styles.buttonDanger}>
              Supprimer la sélection de la galerie ({selectedMedia.size})
            </button>
          )}
        </div>

        {!hideDeleteMessages && deleteFetcher.data?.error && deleteFetcher.data?.intent === "delete_media" && (
          <p className={`${styles.errorText} ${styles.marginTop16}`} role="alert">
            {deleteFetcher.data.error}
          </p>
        )}
        {!hideDeleteMessages && deleteFetcher.data?.success && deleteFetcher.data?.intent === "delete_media" && (
          <p className={`${styles.successMessage} ${styles.marginTop16}`} role="status">
            {deleteFetcher.data.deletedCount} média(s) retiré(s) de la galerie.
          </p>
        )}

        {previewFetcher.data?.error && previewFetcher.data?.intent === "generate_video_preview" && (
          <p className={`${styles.errorText} ${styles.marginTop16}`} role="alert">
            {previewFetcher.data.error}
          </p>
        )}
        {previewFetcher.data?.success && previewFetcher.data?.intent === "generate_video_preview" && (
          <p className={`${styles.successMessage} ${styles.marginTop16}`} role="status">
            {String(previewFetcher.data.success)}
          </p>
        )}

        {/* Media Grid */}
        <div className={styles.modernMediaGrid}>
          {filteredMedia.map(m => {
            const isSelected = selectedMedia.has(m.id);
            const preview = liveVideoPreviews[m.id];
            return (
              <div
                key={m.id}
                className={`${styles.modernMediaCard} ${isSelected ? styles.modernMediaCardSelected : ""}`}
                data-testid="gallery-media-item"
                data-media-id={m.id}
                data-media-type={m.type}
                data-media-visibility={m.visibility}
              >
                <input
                  type="checkbox"
                  className={styles.modernMediaSelectCheckbox}
                  checked={isSelected}
                  onChange={() => toggleMediaSelection(m.id)}
                  aria-label={`Sélectionner ${m.original_name}`}
                />

                <div className={styles.modernMediaThumbContainer}>
                  {m.type === "photo" ? (
                    <img
                      className={styles.modernMediaThumbImg}
                      src={getAdminPhotoPreviewUrl(gallery.public_id, m.id, 480)}
                      alt={m.original_name}
                      loading="lazy"
                      data-testid="gallery-media-image"
                    />
                  ) : m.poster_revision ? (
                    <img
                      className={styles.modernMediaThumbImg}
                      src={`/api/gallery/${gallery.public_id}/media/${m.id}/poster?v=${m.poster_revision}&width=480`}
                      alt={`Couverture de ${m.original_name}`}
                      loading="lazy"
                      data-testid="gallery-media-image"
                    />
                  ) : (
                    <div style={{ textAlign: "center", padding: "1rem" }}>
                      <span style={{ fontSize: "2rem" }}>🎬</span>
                      <p className={styles.helperText} style={{ margin: "0.25rem 0 0 0" }}>Vidéo</p>
                    </div>
                  )}
                </div>

                <div className={styles.modernMediaCardBody}>
                  <div className={styles.modernMediaCardTitle} title={m.original_name}>
                    {m.original_name}
                  </div>

                  <div className={styles.modernMediaCardMetaRow}>
                    <span className={m.visibility === "maries" ? styles.audienceBadgeMaries : styles.audienceBadgeInvites}>
                      {m.visibility === "maries" ? "Mariés (privé)" : "Invités"}
                    </span>
                    <span>{m.type === "photo" ? "Photo" : "Vidéo"}</span>
                  </div>

                  {m.type === "video" && (
                    <div className={styles.videoPreviewControls}>
                      {preview?.state === "ready" && (
                        <span className={`${styles.previewBadge} ${styles.previewBadgeReady}`}>
                          ✓ Aperçu Web prêt
                        </span>
                      )}
                      {preview?.state === "processing" && (
                        <span className={`${styles.previewBadge} ${styles.previewBadgeProcessing}`}>
                          ⚙️ Compression en cours...
                        </span>
                      )}
                      {preview?.state === "failed" && (
                        <span
                          className={`${styles.previewBadge} ${styles.previewBadgeFailed}`}
                          title={(preview as { message?: string })?.message}
                        >
                          ⚠️ Échec aperçu
                        </span>
                      )}
                      {(!preview || preview?.state === "missing") && (
                        <span className={`${styles.previewBadge} ${styles.previewBadgeMissing}`}>
                          Original utilisé
                        </span>
                      )}

                      <previewFetcher.Form method="post">
                        <input type="hidden" name="csrfToken" value={csrfToken} />
                        <input type="hidden" name="intent" value="generate_video_preview" />
                        <input type="hidden" name="mediaId" value={m.id} />
                        <button
                          type="submit"
                          className={styles.posterActionBtn}
                          disabled={previewFetcher.state !== "idle" || preview?.state === "processing"}
                        >
                          {preview?.state === "failed"
                            ? "Réessayer compression"
                            : preview?.state === "ready"
                            ? "Régénérer l'aperçu"
                            : "Générer aperçu web"}
                        </button>
                      </previewFetcher.Form>

                      <VideoPosterManager
                        galleryId={gallery.id}
                        mediaId={m.id}
                        hasPoster={!!m.poster_revision}
                        csrfToken={csrfToken}
                        clearDeleteMessages={() => {
                          setHideDeleteMessages(true);
                        }}
                      />
                    </div>
                  )}

                  <div className={styles.modernMediaCardActions}>
                    <button
                      type="button"
                      className={styles.buttonDanger}
                      style={{ width: "100%", padding: "0.4rem 0.6rem", fontSize: "0.8125rem" }}
                      onClick={() => setConfirmDeleteSingleMedia({ id: m.id, original_name: m.original_name })}
                      disabled={deleteBusy}
                    >
                      Supprimer de la galerie
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredMedia.length === 0 && (
          <p className={styles.helperText} style={{ marginTop: "1rem" }}>
            Aucun média dans cette catégorie.
          </p>
        )}
      </section>

      {/* ── Section: Codes d'Accès & Sécurité ── */}
      <section className={styles.adminCardParallax}>
        <div className={styles.adminCardParallaxHeader}>
          <div>
            <h2 className={styles.adminCardParallaxTitle}>Codes d'accès et sécurité</h2>
            <p className={styles.adminCardParallaxSubtitle}>
              Gérez les codes d'accès confidentiels pour les invités et l'espace privé des mariés.
            </p>
          </div>
          <button type="button" onClick={() => setShowCodes(!showCodes)} className={styles.button}>
            {showCodes ? "Masquer les codes" : "Afficher les codes en clair"}
          </button>
        </div>

        <div className={styles.grid}>
          {/* Guest Code */}
          <div className={styles.card} style={{ marginBottom: 0 }}>
            <h3>Code Invités (Accès public)</h3>
            <p className={styles.helperText}>
              Permet aux invités d'accéder aux photos et vidéos marquées « Invités ».
            </p>
            <div className={styles.flexGroup} style={{ marginTop: "0.75rem" }}>
              <input
                type={showCodes ? "text" : "password"}
                readOnly
                aria-label="Code invités actuel"
                value={guestCode}
                className={`${styles.input} ${styles.flex1}`}
              />
              <button type="button" onClick={() => copyToClipboard(guestCode)} className={styles.button}>
                Copier
              </button>
            </div>
            <Form method="post" className={`${styles.form} ${styles.marginTop16}`}>
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="intent" value="rotate_guest_code" />
              <div className={styles.formGroup}>
                <input type="text" name="guestCode" className={styles.input} placeholder="Nouveau code personnalisé (min 8 car.)" />
              </div>
              {intentMsg("rotate_guest_code")}
              <button type="submit" className={styles.button}>Enregistrer le code</button>
            </Form>
            <Form method="post" className={styles.marginTop8}>
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="intent" value="regenerate_guest_code" />
              {intentMsg("regenerate_guest_code")}
              <button type="submit" className={styles.button}>Régénérer auto le code invités</button>
            </Form>
          </div>

          {/* Couple Code */}
          <div className={styles.card} style={{ marginBottom: 0 }}>
            <h3>Code Mariés (Espace Privé)</h3>
            <p className={styles.helperText}>
              Donne accès à l'intégralité de la galerie (médias invités + médias privés des mariés).
            </p>
            <div className={styles.flexGroup} style={{ marginTop: "0.75rem" }}>
              <input
                type={showCodes ? "text" : "password"}
                readOnly
                aria-label="Code mariés actuel"
                value={coupleCode}
                className={`${styles.input} ${styles.flex1}`}
              />
              <button type="button" onClick={() => copyToClipboard(coupleCode)} className={styles.button}>
                Copier
              </button>
            </div>
            <Form method="post" className={`${styles.form} ${styles.marginTop16}`}>
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="intent" value="rotate_couple_code" />
              <div className={styles.formGroup}>
                <input type="text" name="coupleCode" className={styles.input} placeholder="Nouveau code personnalisé (min 8 car.)" />
              </div>
              {intentMsg("rotate_couple_code")}
              <button type="submit" className={styles.button}>Enregistrer le code</button>
            </Form>
            <Form method="post" className={styles.marginTop8}>
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="intent" value="regenerate_couple_code" />
              {intentMsg("regenerate_couple_code")}
              <button type="submit" className={styles.button}>Régénérer auto le code mariés</button>
            </Form>
          </div>
        </div>
      </section>

      {/* ── Section: Paramètres & Textes de la Galerie ── */}
      <section className={styles.adminCardParallax}>
        <div className={styles.adminCardParallaxHeader}>
          <div>
            <h2 className={styles.adminCardParallaxTitle}>Paramètres et textes de la galerie</h2>
            <p className={styles.adminCardParallaxSubtitle}>
              Personnalisez les noms, dates, messages d'introduction et l'image de couverture.
            </p>
          </div>
        </div>

        <Form method="post" className={styles.form}>
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <input type="hidden" name="intent" value="update_info" />

          <div className={styles.grid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Noms des mariés</label>
              <input type="text" name="bride_names" className={styles.input} required defaultValue={gallery.bride_names} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Date du mariage</label>
              <input type="date" name="wedding_date" className={styles.input} required defaultValue={gallery.wedding_date} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Lieu (optionnel)</label>
              <input type="text" name="location" className={styles.input} defaultValue={gallery.location || ""} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Date d'expiration</label>
              <input type="date" name="expires_at" className={styles.input} defaultValue={new Date(gallery.expires_at).toISOString().split("T")[0]} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Statut de publication</label>
              <select name="status" className={styles.input} defaultValue={gallery.status}>
                <option value="draft">Brouillon (non accessible publiquement)</option>
                <option value="published">Publiée (accessible avec code)</option>
                <option value="archived">Archivée (fermée)</option>
              </select>
            </div>
          </div>

          <div className={styles.grid} style={{ marginTop: "1rem" }}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Introduction (Français)</label>
              <textarea name="intro_fr" className={styles.input} defaultValue={gallery.intro_fr || ""} rows={3} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Introduction (Anglais)</label>
              <textarea name="intro_en" className={styles.input} defaultValue={gallery.intro_en || ""} rows={3} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Signature (Français)</label>
              <input type="text" name="signature_fr" className={styles.input} defaultValue={gallery.signature_fr || ""} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Signature (Anglais)</label>
              <input type="text" name="signature_en" className={styles.input} defaultValue={gallery.signature_en || ""} />
            </div>
          </div>

          {/* Cover photo selection */}
          <div className={styles.formGroup} style={{ marginTop: "1rem" }}>
            <label className={styles.label}>Photographie de couverture</label>
            {galleryPhotos.length > 0 ? (
              <div className={styles.coverGrid}>
                <label className={styles.coverOption}>
                  <input type="radio" name="cover_image_id" value="" defaultChecked={!gallery.cover_image_id} />
                  <span className={styles.coverThumbPlaceholder}>Par défaut</span>
                </label>
                {galleryPhotos.map(p => (
                  <label key={p.id} className={styles.coverOption}>
                    <input type="radio" name="cover_image_id" value={p.id} defaultChecked={gallery.cover_image_id === p.id} />
                    <img className={styles.coverImage} src={getAdminPhotoPreviewUrl(gallery.public_id, p.id, 480)} alt={p.original_name} loading="lazy" />
                  </label>
                ))}
              </div>
            ) : (
              <p className={styles.helperText}>Aucune photo importée. Importez des médias d'abord pour choisir une couverture.</p>
            )}
          </div>

          {intentMsg("update_info")}

          <button type="submit" className={styles.submitButton} style={{ marginTop: "1.25rem" }}>
            Enregistrer les informations
          </button>
        </Form>
      </section>

      {/* ── Section: Historique d'Importation (Compact & Repliable) ── */}
      <section className={styles.adminCardParallax}>
        <details>
          <summary className={styles.adminCardParallaxTitle} style={{ cursor: "pointer" }}>
            Historique d'importation ({imports.length})
          </summary>

          <div style={{ marginTop: "1rem" }}>
            {imports.length === 0 ? (
              <p className={styles.helperText}>Aucun import effectué.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {imports.map(i => {
                  let statusLabel: string = i.status;
                  if (i.status === "processing") statusLabel = `En cours (${i.progress} / ${i.total})`;
                  else if (i.status === "completed") statusLabel = "Terminé";
                  else if (i.status === "failed") statusLabel = "Échoué";
                  else if (i.status === "pending") statusLabel = "En attente";

                  let resultSummary: {
                    transferred?: number;
                    imported?: number;
                    duplicates?: { file: string; reason: string }[];
                    rejected?: { file: string; reason: string }[];
                    errors?: { file: string; reason: string }[];
                    error?: string;
                  } | null = null;

                  if (i.result_json) {
                    try {
                      resultSummary = JSON.parse(i.result_json);
                    } catch {
                      resultSummary = null;
                    }
                  }

                  return (
                    <li key={i.id} style={{ marginBottom: "1rem", borderBottom: "1px solid #f1f5f9", paddingBottom: "1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                        <strong>{new Date(i.created_at).toLocaleString("fr-FR")}</strong>
                        <span
                          className={`${styles.statusPill} ${
                            i.status === "completed"
                              ? styles.statusPillPublished
                              : i.status === "processing" || i.status === "pending"
                              ? styles.statusPillDraft
                              : styles.statusPillArchived
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      {resultSummary && (
                        <div className={styles.importBreakdown}>
                          {resultSummary.error ? (
                            <p className={styles.errorText}>Erreur : {String(resultSummary.error)}</p>
                          ) : (
                            <div>
                              <p style={{ margin: "0 0 0.5rem 0" }}>
                                <strong>Bilan : </strong>
                                {typeof resultSummary.imported === "number" && `${resultSummary.imported} média(s) ajouté(s)`}
                                {resultSummary.duplicates && resultSummary.duplicates.length > 0 && `, ${resultSummary.duplicates.length} déjà présent(s)`}
                                {resultSummary.rejected && resultSummary.rejected.length > 0 && `, ${resultSummary.rejected.length} refusé(s)`}
                                {resultSummary.errors && resultSummary.errors.length > 0 && `, ${resultSummary.errors.length} erreur(s)`}
                              </p>

                              {resultSummary.duplicates && resultSummary.duplicates.length > 0 && (
                                <details style={{ marginTop: "0.5rem" }}>
                                  <summary>Fichiers déjà présents ({resultSummary.duplicates.length})</summary>
                                  <ul className={styles.importBreakdownList}>
                                    {resultSummary.duplicates.map((d, idx) => (
                                      <li key={idx}><strong>{d.file}</strong> : {d.reason}</li>
                                    ))}
                                  </ul>
                                </details>
                              )}

                              {resultSummary.rejected && resultSummary.rejected.length > 0 && (
                                <details style={{ marginTop: "0.5rem" }}>
                                  <summary>Fichiers refusés ({resultSummary.rejected.length})</summary>
                                  <ul className={styles.importBreakdownList}>
                                    {resultSummary.rejected.map((r, idx) => (
                                      <li key={idx}><strong>{r.file}</strong> : {r.reason}</li>
                                    ))}
                                  </ul>
                                </details>
                              )}

                              {resultSummary.errors && resultSummary.errors.length > 0 && (
                                <details style={{ marginTop: "0.5rem" }}>
                                  <summary>Erreurs ({resultSummary.errors.length})</summary>
                                  <ul className={styles.importBreakdownList}>
                                    {resultSummary.errors.map((e, idx) => (
                                      <li key={idx}><strong>{e.file}</strong> : {e.reason}</li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </details>
      </section>

      {/* ── Single Media Delete Modal (Supprimer de la galerie) ── */}
      {confirmDeleteSingleMedia && (
        <div className={styles.galleryDeleteModalOverlay}>
          <div
            className={styles.galleryDeleteModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-single-delete-title"
            tabIndex={-1}
            ref={(el) => { if (el && !deleteBusy) el.focus(); }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && !deleteBusy) {
                setConfirmDeleteSingleMedia(null);
              }
            }}
          >
            <h3 id="gallery-single-delete-title" className={styles.modalTitle}>Retirer le média de la galerie</h3>
            <p>
              Voulez-vous vraiment retirer <strong>« {confirmDeleteSingleMedia.original_name} »</strong> de la galerie ?
            </p>
            <p className={styles.helperText}>
              Cette action supprime le média de la galerie ainsi que ses aperçus et affiches. Le fichier source original sur le Mac mini reste conservé pour un éventuel réimport.
            </p>
            <div className={styles.galleryDeleteModalActions}>
              <button
                type="button"
                className={styles.button}
                onClick={() => setConfirmDeleteSingleMedia(null)}
                disabled={deleteBusy}
              >
                Annuler
              </button>
              <deleteFetcher.Form method="post">
                <input type="hidden" name="csrfToken" value={csrfToken} />
                <input type="hidden" name="intent" value="delete_media" />
                <input type="hidden" name="mediaIds" value={confirmDeleteSingleMedia.id} />
                <button type="submit" className={styles.buttonDanger} disabled={deleteBusy}>
                  {deleteBusy ? "Suppression..." : "Supprimer définitivement"}
                </button>
              </deleteFetcher.Form>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Delete Modal (Supprimer de la galerie) ── */}
      {showDeleteModal && (
        <div className={styles.galleryDeleteModalOverlay}>
          <div
            className={styles.galleryDeleteModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-delete-title"
            tabIndex={-1}
            ref={(el) => { if (el && !deleteBusy) el.focus(); }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && !deleteBusy) {
                setShowDeleteModal(false);
              }
            }}
          >
            <h3 id="gallery-delete-title" className={styles.modalTitle}>Confirmer la suppression de la sélection</h3>
            <p>Voulez-vous vraiment retirer {selectedMedia.size} média(s) de la galerie ?</p>
            <p className={styles.helperText}>
              Cette action supprime les médias de la galerie. Les fichiers sources éventuels sur le Mac mini restent intacts.
            </p>
            <div className={styles.galleryDeleteModalActions}>
              <button type="button" className={styles.button} onClick={() => setShowDeleteModal(false)} disabled={deleteBusy}>
                Annuler
              </button>
              <deleteFetcher.Form method="post">
                <input type="hidden" name="csrfToken" value={csrfToken} />
                <input type="hidden" name="intent" value="delete_media" />
                {Array.from(selectedMedia).map(id => (
                  <input key={id} type="hidden" name="mediaIds" value={id} />
                ))}
                <button type="submit" className={styles.buttonDanger} disabled={deleteBusy}>
                  {deleteBusy ? "Suppression..." : "Supprimer définitivement"}
                </button>
              </deleteFetcher.Form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VideoPosterManager({ galleryId, mediaId, hasPoster, csrfToken, clearDeleteMessages }: { galleryId: string, mediaId: string, hasPoster: boolean, csrfToken: string, clearDeleteMessages: () => void }) {
  const fetcher = useFetcher();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUploading = fetcher.state !== "idle";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    clearDeleteMessages();
    const formData = new FormData();
    formData.append("file", e.target.files[0]);
    formData.append("csrfToken", csrfToken);
    fetcher.submit(formData, {
      method: "post",
      action: `/api/admin/gallery/${galleryId}/media/${mediaId}/poster`,
      encType: "multipart/form-data",
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearDeleteMessages();
    const formData = new FormData();
    formData.append("intent", "delete_poster");
    formData.append("csrfToken", csrfToken);
    fetcher.submit(formData, {
      method: "post",
      action: `/api/admin/gallery/${galleryId}/media/${mediaId}/poster`,
    });
  };

  return (
    <div className={styles.posterManagerWrapper}>
      <input
        type="file"
        accept="image/jpeg, image/png, image/webp, image/avif"
        className={styles.hiddenInput}
        ref={fileInputRef}
        onChange={handleFileChange}
        aria-label="Upload poster"
        tabIndex={-1}
      />

      <div className={styles.posterManagerButtons}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
          className={styles.posterActionBtn}
          disabled={isUploading}
        >
          {hasPoster ? "Remplacer la couverture" : "Ajouter une couverture"}
        </button>

        {hasPoster && (
          <button
            type="button"
            onClick={handleDelete}
            className={styles.posterActionBtnDanger}
            disabled={isUploading}
          >
            Supprimer la couverture
          </button>
        )}
      </div>

      <div className={styles.posterStatusIndicator}>
        {isUploading && <span className={styles.posterStatus}>Envoi en cours...</span>}
        {!isUploading && fetcher.data && (fetcher.data as { success?: boolean }).success && (
          <span className={styles.posterStatusSuccess}>Succès</span>
        )}
        {!isUploading && fetcher.data && (fetcher.data as { error?: string }).error && (
          <span className={styles.posterStatusError}>{(fetcher.data as { error?: string }).error}</span>
        )}
      </div>
    </div>
  );
}
