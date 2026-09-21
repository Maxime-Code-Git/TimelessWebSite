import { Form, Link, useActionData, useLoaderData, useRevalidator, useFetcher } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireValidAdminSession, validateAdminFormData, createAdminHeaders, ActionSecurityError } from "../lib/admin-auth.server";
import { getGalleryById, updateGallery, rotateGalleryCode, CodeCollisionError, getGalleryMediaStats, getGalleryImports } from "../lib/gallery.server";
import type { GalleryImportRow, GalleryMediaRow } from "../lib/gallery.server";
import { decryptGalleryCode, generateGalleryCode } from "../lib/gallery-auth.server";
import { getGalleryDb } from "../lib/gallery-db.server";
import { getAvailableImportFolders } from "../lib/gallery-import.server";
import styles from "./admin.module.css";
import { commitSession } from "../lib/session.server";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ENV } from "../lib/env.server";
import { useEffect, useState, useRef } from "react";
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

  const folders = getAvailableImportFolders();

  // Get gallery photos for cover selection
  const db = getGalleryDb();
  const allMedia = db.prepare(
    "SELECT id, type, visibility, original_name, width, height, poster_revision FROM gallery_media WHERE gallery_id = ? ORDER BY created_at ASC"
  ).all(gallery.id) as Pick<GalleryMediaRow, "id" | "type" | "visibility" | "original_name" | "width" | "height" | "poster_revision">[];

  const galleryPhotos = allMedia.filter(m => m.type === "photo");

  return Response.json({ gallery, stats, imports, folders, guestCode, coupleCode, csrfToken, allMedia, galleryPhotos }, { headers });
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
            fs.mkdirSync(path.dirname(dest), { recursive: true });
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
  success?: boolean;
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
  guestCode: string;
  coupleCode: string;
  csrfToken: string;
  allMedia: { id: string; type: string; visibility: string; original_name: string; width: number | null; height: number | null; poster_revision: string | null }[];
  galleryPhotos: { id: string; original_name: string; width: number | null; height: number | null }[];
}

type ImportActionData = {
  importId?: string;
  status?: "pending";
  error?: string;
};

export default function AdminGalleryEdit() {
  const { gallery, stats, imports, folders, guestCode, coupleCode, csrfToken, galleryPhotos, allMedia } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const revalidator = useRevalidator();
  const importFetcher = useFetcher<ImportActionData>();
  const deleteFetcher = useFetcher<ActionData>();

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
    // Reset hide state when a new delete starts
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
    }
  }, [deleteFetcher.data]);

  const hasActiveImport = imports.some(i => i.status === "pending" || i.status === "processing");
  const importBusy = importFetcher.state !== "idle" || hasActiveImport;
  const deleteBusy = deleteFetcher.state !== "idle";

  // Auto-reload when import is active
  useEffect(() => {
    if (hasActiveImport) {
      const interval = setInterval(() => {
        revalidator.revalidate();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [hasActiveImport, revalidator]);

  // When import finishes, reload stats
  useEffect(() => {
    if (importFetcher.data && importFetcher.state === "idle") {
      revalidator.revalidate();
    }
  }, [importFetcher.data, importFetcher.state, revalidator]);

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
      <div className={styles.headerRow}>
        <h2>Gérer la galerie : {gallery.bride_names}</h2>
        <Link to="/admin/galleries" className={styles.button}>Retour aux galeries</Link>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h3>Informations générales</h3>
          <Form method="post" className={styles.form}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="intent" value="update_info" />

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
              <label className={styles.label}>Statut</label>
              <select name="status" className={styles.input} defaultValue={gallery.status}>
                <option value="draft">Brouillon</option>
                <option value="published">Publié</option>
                <option value="archived">Archivé</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Intro FR</label>
              <textarea name="intro_fr" className={styles.input} defaultValue={gallery.intro_fr || ""} rows={3} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Intro EN</label>
              <textarea name="intro_en" className={styles.input} defaultValue={gallery.intro_en || ""} rows={3} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Signature FR</label>
              <input type="text" name="signature_fr" className={styles.input} defaultValue={gallery.signature_fr || ""} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Signature EN</label>
              <input type="text" name="signature_en" className={styles.input} defaultValue={gallery.signature_en || ""} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Image de couverture</label>
              {galleryPhotos.length > 0 ? (
                <div className={styles.coverGrid}>
                  <label className={styles.coverOption}>
                    <input type="radio" name="cover_image_id" value="" defaultChecked={!gallery.cover_image_id} />
                    <span className={styles.coverThumbPlaceholder}>Aucune</span>
                  </label>
                  {galleryPhotos.map(p => (
                    <label key={p.id} className={styles.coverOption}>
                      <input type="radio" name="cover_image_id" value={p.id} defaultChecked={gallery.cover_image_id === p.id} />
                      <img className={styles.coverImage} src={`/api/gallery/${gallery.public_id}/media/${p.id}?width=480`} alt={p.original_name} loading="lazy" />
                    </label>
                  ))}
                </div>
              ) : (
                <p className={styles.helperText}>Aucune photo importée. Importez des médias d'abord.</p>
              )}
            </div>

            {intentMsg("update_info")}

            <button type="submit" className={styles.submitButton}>
              Enregistrer les informations
            </button>
          </Form>
        </div>

        <div className={styles.card}>
          <h3>Codes d'accès</h3>
          <button type="button" onClick={() => setShowCodes(!showCodes)} className={styles.button}>
            {showCodes ? "Masquer les codes" : "Afficher les codes"}
          </button>

          {/* Guest code section */}
          <h4>Code Invités</h4>
          <div className={styles.flexGroup}>
            <input type={showCodes ? "text" : "password"} readOnly aria-label="Code invités actuel" value={guestCode} className={`${styles.input} ${styles.flex1}`} />
            <button type="button" onClick={() => copyToClipboard(guestCode)} className={styles.button}>Copier</button>
          </div>
          <Form method="post" className={`${styles.form} ${styles.marginBottom16}`}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="intent" value="rotate_guest_code" />
            <div className={styles.formGroup}>
              <input type="text" name="guestCode" className={styles.input} placeholder="Nouveau code invités (min 8 car.)" />
            </div>
            {intentMsg("rotate_guest_code")}
            <button type="submit" className={styles.button}>Modifier le code invités</button>
          </Form>
          <Form method="post" className={styles.marginBottom24}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="intent" value="regenerate_guest_code" />
            {intentMsg("regenerate_guest_code")}
            <button type="submit" className={styles.button}>Régénérer auto le code invités</button>
          </Form>

          {/* Couple code section */}
          <h4>Code Mariés</h4>
          <div className={styles.flexGroup}>
            <input type={showCodes ? "text" : "password"} readOnly aria-label="Code mariés actuel" value={coupleCode} className={`${styles.input} ${styles.flex1}`} />
            <button type="button" onClick={() => copyToClipboard(coupleCode)} className={styles.button}>Copier</button>
          </div>
          <Form method="post" className={`${styles.form} ${styles.marginBottom16}`}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="intent" value="rotate_couple_code" />
            <div className={styles.formGroup}>
              <input type="text" name="coupleCode" className={styles.input} placeholder="Nouveau code mariés (min 8 car.)" />
            </div>
            {intentMsg("rotate_couple_code")}
            <button type="submit" className={styles.button}>Modifier le code mariés</button>
          </Form>
          <Form method="post">
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="intent" value="regenerate_couple_code" />
            {intentMsg("regenerate_couple_code")}
            <button type="submit" className={styles.button}>Régénérer auto le code mariés</button>
          </Form>

          <p className={`${styles.helperText} ${styles.marginTop16}`}>
            Modifier un code invalide immédiatement les sessions actives de ce niveau.
          </p>
        </div>
      </div>

      <div className={styles.card}>
        <h3>Médias de la galerie</h3>
        <ul>
          <li>Photos Invités : {stats.invitesPhotos}</li>
          <li>Vidéos Invités : {stats.invitesVideos}</li>
          <li>Photos Mariés : {stats.mariesPhotos}</li>
          <li>Vidéos Mariés : {stats.mariesVideos}</li>
        </ul>

        <h4>Importer des médias</h4>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="import_folder">Dossier d'import</label>
          <select id="import_folder"
            className={styles.input}
            value={selectedFolder}
            onChange={e => {
              setSelectedFolder(e.target.value);
              loadPreview(e.target.value);
            }}
          >
            <option value="">Sélectionnez un dossier...</option>
            {folders.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        {previewLoading && <p>Analyse du dossier en cours...</p>}

        {previewData && !previewLoading && (
          <div className={`${styles.previewBox} ${previewData.error ? styles.previewBoxError : ''}`}>
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
                  <details>
                    <summary>Fichiers refusés ({(previewData.rejected as { file: string; reason: string }[]).length})</summary>
                    <ul>
                      {(previewData.rejected as { file: string; reason: string }[]).map((r, i) => (
                        <li key={i}>{r.file} — {r.reason}</li>
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

        {previewData && !previewData.error && !previewLoading && (
          <importFetcher.Form
            method="post"
            action={`/api/admin/gallery-import/${gallery.id}`}
            encType="application/x-www-form-urlencoded"
          >
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="folderName" value={selectedFolder} />

            <button
              type="submit"
              className={styles.submitButton}
              disabled={importBusy || !selectedFolder}
            >
              {importBusy ? "Import en cours..." : "Confirmer et lancer l'import"}
            </button>
          </importFetcher.Form>
        )}

        <h4>Historique d'importation</h4>
        {imports.length === 0 ? (
          <p>Aucun import effectué.</p>
        ) : (
          <ul>
            {imports.map(i => {
              let statusLabel: string = i.status;
              if (i.status === "processing") statusLabel = `En cours (${i.progress} / ${i.total})`;
              else if (i.status === "completed") statusLabel = "Terminé";
              else if (i.status === "failed") statusLabel = "Échoué";
              else if (i.status === "pending") statusLabel = "En attente";

              let resultSummary: string | null = null;
              if (i.result_json) {
                try {
                  const result = JSON.parse(i.result_json);
                  if (result.error) {
                    resultSummary = `Erreur : ${String(result.error)}`;
                  } else {
                    resultSummary = `${String(result.imported)} importé(s), ${String((result.ignored as { file: string }[])?.length || 0)} ignoré(s)`;
                  }
                } catch {
                  resultSummary = null;
                }
              }

              return (
                <li key={i.id}>
                  <strong>{new Date(i.created_at).toLocaleString()}</strong> — {statusLabel}
                  {resultSummary && <span> — {resultSummary}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={styles.card}>
        <h3>Gestion des médias</h3>
        <p className={styles.helperText}>
          Les médias importés sont des copies indépendantes. Supprimer un fichier du dossier d'import ne le retire pas de la galerie. Utilisez cette section pour supprimer les médias déjà importés.
        </p>

        <div className={`${styles.formGroup} ${styles.marginTop16}`}>
          <label className={styles.label}>Filtrer par catégorie</label>
          <select className={styles.input} value={mediaFilter} onChange={e => {
            setMediaFilter(e.target.value as "all" | "invites-photo" | "invites-video" | "maries-photo" | "maries-video");
            setSelectedMedia(new Set());
          }}>
            <option value="all">Tous les médias ({allMedia?.length || 0})</option>
            <option value="invites-photo">Photos Invités ({stats.invitesPhotos})</option>
            <option value="invites-video">Vidéos Invités ({stats.invitesVideos})</option>
            <option value="maries-photo">Photos Mariés ({stats.mariesPhotos})</option>
            <option value="maries-video">Vidéos Mariés ({stats.mariesVideos})</option>
          </select>
        </div>

        <div className={styles.flexGroup}>
          <button type="button" onClick={toggleSelectAllFiltered} className={styles.button}>
            {filteredMedia.length > 0 && filteredMedia.every(media => selectedMedia.has(media.id)) ? "Désélectionner tout" : "Sélectionner tout"}
          </button>
          {selectedMedia.size > 0 && (
            <button type="button" onClick={() => setShowDeleteModal(true)} className={styles.buttonDanger}>
              Supprimer la sélection ({selectedMedia.size})
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
            {deleteFetcher.data.deletedCount} média(s) supprimé(s).
          </p>
        )}

        <div className={styles.mediaGrid}>
          {filteredMedia.map(m => (
            <label key={m.id} className={`${styles.mediaItem} ${selectedMedia.has(m.id) ? styles.selected : ''}`} data-testid="gallery-media-item" data-media-id={m.id} data-media-type={m.type} data-media-visibility={m.visibility}>
              <input type="checkbox" className={styles.mediaCheckbox} checked={selectedMedia.has(m.id)} onChange={() => toggleMediaSelection(m.id)} aria-label={`Sélectionner ${m.original_name}`} />
              {m.type === "photo" ? (
                <img className={styles.mediaItemImage} src={`/api/gallery/${gallery.public_id}/media/${m.id}?width=480`} alt={m.original_name} loading="lazy" data-testid="gallery-media-image" />
              ) : (
                <div className={styles.videoPosterContainer} onClick={(e) => {
                  // Prevent clicking inner elements from selecting the media
                  if ((e.target as HTMLElement).tagName !== "DIV" && (e.target as HTMLElement).tagName !== "IMG") {
                    e.stopPropagation();
                  }
                }}>
                  {m.poster_revision ? (
                    <img className={styles.mediaItemImage} src={`/api/gallery/${gallery.public_id}/media/${m.id}/poster?v=${m.poster_revision}&width=480`} alt="Cover" loading="lazy" data-testid="gallery-media-image" />
                  ) : (
                    <div className={styles.coverThumbPlaceholder}>Vidéo</div>
                  )}
                  <div className={styles.videoPosterControls}>
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
                </div>
              )}
            </label>
          ))}
          {filteredMedia.length === 0 && (
            <p className={styles.helperText}>Aucun média trouvé.</p>
          )}
        </div>
      </div>

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
            <h3 id="gallery-delete-title" className={styles.modalTitle}>Confirmer la suppression</h3>
            <p>Voulez-vous vraiment supprimer {selectedMedia.size} média(s) ? Cette action est irréversible.</p>
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
    fetcher.submit(formData, {
      method: "post",
      action: `/api/admin/gallery/${galleryId}/media/${mediaId}/poster?csrfToken=${csrfToken}`,
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
