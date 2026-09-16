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
import { useEffect, useState } from "react";

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
  const galleryPhotos = db.prepare(
    "SELECT id, original_name, width, height FROM gallery_media WHERE gallery_id = ? AND type = 'photo' ORDER BY created_at ASC"
  ).all(gallery.id) as Pick<GalleryMediaRow, "id" | "original_name" | "width" | "height">[];

  return Response.json({ gallery, stats, imports, folders, guestCode, coupleCode, csrfToken, galleryPhotos }, { headers });
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

  return Response.json({ error: "Intent inconnu.", intent }, { status: 400 });
}

interface ActionData {
  error?: string;
  success?: boolean;
  intent?: string;
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
  galleryPhotos: { id: string; original_name: string; width: number | null; height: number | null }[];
}

type ImportActionData = {
  importId?: string;
  status?: "pending";
  error?: string;
};

export default function AdminGalleryEdit() {
  const { gallery, stats, imports, folders, guestCode, coupleCode, csrfToken, galleryPhotos } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const revalidator = useRevalidator();
  const importFetcher = useFetcher<ImportActionData>();

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

  const hasActiveImport = imports.some(i => i.status === "pending" || i.status === "processing");
  const importBusy = importFetcher.state !== "idle" || hasActiveImport;

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
        <Link to="/admin/galleries" className={styles.button}>Retour</Link>
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
    </div>
  );
}
