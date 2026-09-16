import { Form, Link, useActionData, useLoaderData, useRevalidator, useFetcher } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireValidAdminSession, validateAdminFormData, createAdminHeaders, ActionSecurityError } from "../lib/admin-auth.server";
import { getGalleryById, updateGallery, rotateGalleryCode, CodeCollisionError, getGalleryMediaStats, getGalleryImports } from "../lib/gallery.server";
import type { GalleryImportRow, GalleryMediaRow } from "../lib/gallery.server";
import { decryptGalleryCode, generateGalleryCode } from "../lib/gallery-auth.server";
import { getGalleryDb } from "../lib/gallery-db.server";
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

  const { getAvailableImportFolders } = await import("../lib/gallery-import.server");
  const folders = getAvailableImportFolders();

  // Get gallery photos for cover selection
  const db = getGalleryDb();
  const galleryPhotos = db.prepare(
    "SELECT id, original_name, width, height FROM gallery_media WHERE gallery_id = ? AND type = 'photo' ORDER BY created_at ASC LIMIT 100"
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
    const bride_names = String(formData.get("bride_names"));
    const wedding_date = String(formData.get("wedding_date"));
    const location = formData.get("location") ? String(formData.get("location")) : undefined;
    const expiresStr = formData.get("expires_at");
    const expires_at = expiresStr ? new Date(String(expiresStr)).getTime() : gallery.expires_at;
    const status = String(formData.get("status")) as "draft" | "published" | "archived";

    const intro_fr = formData.get("intro_fr") ? String(formData.get("intro_fr")) : undefined;
    const intro_en = formData.get("intro_en") ? String(formData.get("intro_en")) : undefined;
    const signature_fr = formData.get("signature_fr") ? String(formData.get("signature_fr")) : undefined;
    const signature_en = formData.get("signature_en") ? String(formData.get("signature_en")) : undefined;
    const cover_image_id = formData.get("cover_image_id") ? String(formData.get("cover_image_id")) : undefined;

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

export default function AdminGalleryEdit() {
  const { gallery, stats, imports, folders, guestCode, coupleCode, csrfToken, galleryPhotos } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const revalidator = useRevalidator();
  const importFetcher = useFetcher();

  const [showCodes, setShowCodes] = useState(false);
  const [previewData, setPreviewData] = useState<Record<string, unknown> | null>(null);
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

  const launchImport = () => {
    if (!selectedFolder || importBusy) return;
    importFetcher.submit(
      { csrfToken, folderName: selectedFolder },
      { method: "post", action: `/api/admin/gallery-import/${gallery.id}` }
    );
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
              <input type="text" name="wedding_date" className={styles.input} required defaultValue={gallery.wedding_date} />
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
                <select name="cover_image_id" className={styles.input} defaultValue={gallery.cover_image_id || ""}>
                  <option value="">Aucune</option>
                  {galleryPhotos.map(p => (
                    <option key={p.id} value={p.id}>{p.original_name} ({p.width}×{p.height})</option>
                  ))}
                </select>
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
          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
            <input type={showCodes ? "text" : "password"} readOnly value={guestCode} className={styles.input} style={{ flex: 1 }} />
            <button type="button" onClick={() => copyToClipboard(guestCode)} className={styles.button}>Copier</button>
          </div>
          <Form method="post" className={styles.form} style={{ marginBottom: "16px" }}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="intent" value="rotate_guest_code" />
            <div className={styles.formGroup}>
              <input type="text" name="guestCode" className={styles.input} placeholder="Nouveau code invités (min 8 car.)" />
            </div>
            {intentMsg("rotate_guest_code")}
            <button type="submit" className={styles.button}>Modifier le code invités</button>
          </Form>
          <Form method="post" style={{ marginBottom: "24px" }}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="intent" value="regenerate_guest_code" />
            {intentMsg("regenerate_guest_code")}
            <button type="submit" className={styles.button}>Régénérer auto le code invités</button>
          </Form>

          {/* Couple code section */}
          <h4>Code Mariés</h4>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
            <input type={showCodes ? "text" : "password"} readOnly value={coupleCode} className={styles.input} style={{ flex: 1 }} />
            <button type="button" onClick={() => copyToClipboard(coupleCode)} className={styles.button}>Copier</button>
          </div>
          <Form method="post" className={styles.form} style={{ marginBottom: "16px" }}>
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

          <p className={styles.helperText} style={{ marginTop: "16px" }}>
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
          <label className={styles.label}>Dossier d'import</label>
          <select
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
          <div style={{ margin: "12px 0", padding: "12px", border: "1px solid var(--gold-light)", borderRadius: "8px" }}>
            {previewData.error ? (
              <p className={styles.errorText}>{String(previewData.error)}</p>
            ) : (
              <>
                <p><strong>Aperçu :</strong></p>
                <ul>
                  <li>Photos invités : {String(previewData.invitesPhotosCount)}</li>
                  <li>Vidéos invités : {String(previewData.invitesVideosCount)}</li>
                  <li>Photos mariés : {String(previewData.mariesPhotosCount)}</li>
                  <li>Vidéos mariés : {String(previewData.mariesVideosCount)}</li>
                  <li><strong>Total : {String(previewData.total)}</strong></li>
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
              </>
            )}
          </div>
        )}

        {previewData && !previewData.error && !previewLoading && (
          <button
            type="button"
            className={styles.submitButton}
            disabled={importBusy}
            onClick={() => {
              if (confirm(`Lancer l'import de ${String(previewData.total)} fichiers ?`)) {
                launchImport();
              }
            }}
          >
            {importBusy ? "Import en cours..." : "Confirmer et lancer l'import"}
          </button>
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
