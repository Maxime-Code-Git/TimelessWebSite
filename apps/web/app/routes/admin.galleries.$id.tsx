import { Form, Link, useActionData, useNavigation, useLoaderData, useRevalidator } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireValidAdminSession, validateAdminFormData, createAdminHeaders, ActionSecurityError } from "../lib/admin-auth.server";
import { getGalleryById, updateGallery, rotateGalleryCodes, getGalleryMediaStats, getGalleryImports } from "../lib/gallery.server";
import { decryptGalleryCode, generateGalleryCode } from "../lib/gallery-auth.server";
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
  let csrfToken = session.get("csrfToken");
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    session.set("csrfToken", csrfToken);
    headers.set("Set-Cookie", await commitSession(session));
  }

  const { getAvailableImportFolders } = await import("../lib/gallery-import.server");
  const folders = getAvailableImportFolders();

  return Response.json({ gallery, stats, imports, folders, guestCode, coupleCode, csrfToken }, { headers });
}

export async function action({ request, params }: ActionFunctionArgs) {
  let formData: FormData;
  try {
    formData = await validateAdminFormData(request);
  } catch (err) {
    if (err instanceof ActionSecurityError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  const intent = formData.get("intent");
  const gallery = getGalleryById(params.id!);
  if (!gallery) return Response.json({ error: "Gallery not found" }, { status: 404 });

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
        return Response.json({ error: "Une galerie ne peut pas être publiée sans média valide." }, { status: 400 });
      }

      const pendingImports = getGalleryImports(gallery.id).filter(i => i.status === "pending" || i.status === "processing");
      if (pendingImports.length > 0) {
        return Response.json({ error: "Une galerie ne peut pas être publiée si un import est en cours." }, { status: 400 });
      }

      if (cover_image_id) {
        const db = (await import("../lib/gallery-db.server")).getGalleryDb();
        const checkCover = db.prepare("SELECT id FROM gallery_media WHERE id = ? AND gallery_id = ?").get(cover_image_id, gallery.id);
        if (!checkCover) {
          return Response.json({ error: "L'image de couverture choisie est invalide ou n'appartient pas à cette galerie." }, { status: 400 });
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
    return Response.json({ success: true });
  }

  if (intent === "update_codes") {
    const guestCode = String(formData.get("guestCode") || "").trim().toUpperCase();
    const coupleCode = String(formData.get("coupleCode") || "").trim().toUpperCase();

    if (!guestCode || !coupleCode) {
      return Response.json({ error: "Les deux codes sont obligatoires." }, { status: 400 });
    }
    if (guestCode.length < 8 || coupleCode.length < 8) {
      return Response.json({ error: "Les codes doivent faire au moins 8 caractères." }, { status: 400 });
    }
    if (guestCode === coupleCode) {
      return Response.json({ error: "Les deux codes d'une galerie ne peuvent pas être identiques." }, { status: 400 });
    }

    try {
      rotateGalleryCodes(gallery.id, guestCode, coupleCode);
      return Response.json({ success: true });
    } catch (err: any) {
      if (err.status === 409) {
        return Response.json({ error: "L'un des codes choisis est déjà utilisé ailleurs. Veuillez en choisir d'autres." }, { status: 409 });
      }
      return Response.json({ error: "Erreur lors de la mise à jour des codes." }, { status: 500 });
    }
  }

  if (intent === "regenerate_codes") {
    let success = false;
    let attempts = 0;
    while (!success && attempts < 5) {
      const guestCode = generateGalleryCode();
      let coupleCode = generateGalleryCode();
      while (guestCode === coupleCode) coupleCode = generateGalleryCode();
      try {
        rotateGalleryCodes(gallery.id, guestCode, coupleCode);
        success = true;
      } catch (err: any) {
        if (err.status !== 409) {
          return Response.json({ error: "Erreur lors de la génération." }, { status: 500 });
        }
      }
      attempts++;
    }
    if (!success) {
      return Response.json({ error: "Impossible de générer des codes uniques, veuillez réessayer." }, { status: 500 });
    }
    return Response.json({ success: true });
  }

  return Response.json({ error: "Intent inconnu." }, { status: 400 });
}

export default function AdminGalleryEdit() {
  const { gallery, stats, imports, folders, guestCode, coupleCode, csrfToken } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string, success?: boolean }>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const isSubmitting = navigation.state === "submitting";

  const [showCodes, setShowCodes] = useState(false);

  useEffect(() => {
    const activeImport = imports.some((i: Record<string, unknown>) => i.status === "pending" || i.status === "processing");
    if (activeImport) {
      const interval = setInterval(() => {
        revalidator.revalidate();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [imports, revalidator]);

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
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
              <label className={styles.label}>ID Image de couverture (optionnel)</label>
              <input type="text" name="cover_image_id" className={styles.input} defaultValue={gallery.cover_image_id || ""} />
            </div>

            {actionData?.error && navigation.formData?.get("intent") === "update_info" && (
              <p className={styles.errorText} role="alert">{actionData.error}</p>
            )}

            {actionData?.success && navigation.formData?.get("intent") === "update_info" && (
              <p className={styles.successMessage} role="status">Informations mises à jour.</p>
            )}

            <button type="submit" disabled={isSubmitting} className={styles.submitButton}>
              {isSubmitting ? "Enregistrement..." : "Enregistrer les informations"}
            </button>
          </Form>
        </div>

        <div className={styles.card}>
          <h3>Codes d'accès</h3>
          <button type="button" onClick={() => setShowCodes(!showCodes)} className={styles.button}>
            {showCodes ? "Masquer les codes" : "Afficher les codes"}
          </button>

          <Form method="post" className={styles.form}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="intent" value="regenerate_codes" />
            <button type="submit" className={styles.button}>Régénérer automatiquement les codes</button>
          </Form>

          <Form method="post" className={styles.form}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="intent" value="update_codes" />

            <div className={styles.formGroup}>
              <label className={styles.label}>Code Invités</label>
              <div>
                <input type={showCodes ? "text" : "password"} name="guestCode" className={styles.input} defaultValue={guestCode} required />
                <button type="button" onClick={() => copyToClipboard(guestCode)} className={styles.button}>Copier</button>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Code Mariés</label>
              <div>
                <input type={showCodes ? "text" : "password"} name="coupleCode" className={styles.input} defaultValue={coupleCode} required />
                <button type="button" onClick={() => copyToClipboard(coupleCode)} className={styles.button}>Copier</button>
              </div>
            </div>

            <p className={styles.helperText}>
              Modifier un code invalidant immédiatement les sessions actives associées à ce niveau d'accès.
            </p>

            {actionData?.error && (navigation.formData?.get("intent") === "update_codes" || navigation.formData?.get("intent") === "regenerate_codes") && (
              <p className={styles.errorText} role="alert">{actionData.error}</p>
            )}

            {actionData?.success && (navigation.formData?.get("intent") === "update_codes" || navigation.formData?.get("intent") === "regenerate_codes") && (
              <p className={styles.successMessage} role="status">Codes mis à jour.</p>
            )}

            <button type="submit" disabled={isSubmitting} className={styles.submitButton}>
              Enregistrer les codes manuellement
            </button>
          </Form>
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

        <h4>Lancer un nouvel import</h4>
        <Form method="post" action={`/api/admin/gallery-import/${gallery.id}`} className={styles.form}>
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <div className={styles.formGroup}>
            <label className={styles.label}>Dossier d'import</label>
            <select name="folderName" className={styles.input} required>
              <option value="">Sélectionnez un dossier...</option>
              {folders.map((f: string) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <button type="submit" className={styles.button}>Lancer l'importation</button>
        </Form>

        <h4>Historique d'importation</h4>
        {imports.length === 0 ? (
          <p>Aucun import effectué.</p>
        ) : (
          <ul>
            {imports.map((i: Record<string, unknown>) => (
              <li key={i.id as string}>
                <strong>{new Date(i.created_at as number).toLocaleString()}</strong> - Statut : {i.status as string}
                {i.status === "processing" ? ` (${i.progress as number} / ${i.total as number})` : ""}
                {Boolean(i.result_json) && (
                  <pre className={styles.helperText}>{String(i.result_json)}</pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
