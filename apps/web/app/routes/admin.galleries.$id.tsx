import { Form, Link, useActionData, useNavigation, useLoaderData, useRevalidator } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireValidAdminSession, validateAdminFormData, createAdminHeaders, ActionSecurityError } from "../lib/admin-auth.server";
import { getGalleryById, updateGallery, rotateGalleryCodes, getGalleryMediaStats, getGalleryImports } from "../lib/gallery.server";
import { decryptGalleryCode, hashGalleryCode, generateGalleryCode } from "../lib/gallery-auth.server";
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

  return Response.json({ gallery, stats, imports, guestCode, coupleCode, csrfToken }, { headers });
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

    if (status === "published") {
      const stats = getGalleryMediaStats(gallery.id);
      if (stats.invitesPhotos === 0 && stats.invitesVideos === 0 && stats.mariesPhotos === 0 && stats.mariesVideos === 0) {
        return Response.json({ error: "Une galerie ne peut pas être publiée sans média valide." }, { status: 400 });
      }
    }

    updateGallery(gallery.id, {
      bride_names,
      wedding_date,
      location,
      expires_at,
      status
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

    // Checking collision across other galleries is a nice to have here, but we will catch DB UNIQUE violations if we implemented that.
    // Wait, codes are not strictly UNIQUE in DB (only their hashes), but we can't let them overlap.
    const db = (await import("../lib/gallery-db.server")).getGalleryDb();
    const guestHash = hashGalleryCode(guestCode);
    const coupleHash = hashGalleryCode(coupleCode);
    const check1 = db.prepare("SELECT id FROM galleries WHERE (guest_code_hash = ? OR couple_code_hash = ?) AND id != ?").get(guestHash, guestHash, gallery.id);
    const check2 = db.prepare("SELECT id FROM galleries WHERE (guest_code_hash = ? OR couple_code_hash = ?) AND id != ?").get(coupleHash, coupleHash, gallery.id);

    if (check1 || check2) {
      return Response.json({ error: "L'un de ces codes est déjà utilisé par une autre galerie." }, { status: 400 });
    }

    rotateGalleryCodes(gallery.id, guestCode, coupleCode);
    return Response.json({ success: true });
  }

  if (intent === "regenerate_codes") {
    const guestCode = generateGalleryCode();
    let coupleCode = generateGalleryCode();
    while (guestCode === coupleCode) coupleCode = generateGalleryCode();

    rotateGalleryCodes(gallery.id, guestCode, coupleCode);
    return Response.json({ success: true });
  }

  return Response.json({ error: "Intent inconnu." }, { status: 400 });
}

interface LoaderData {
  gallery: ReturnType<typeof getGalleryById> & { id: string, bride_names: string, wedding_date: string, location: string | null, expires_at: number, status: string };
  stats: ReturnType<typeof getGalleryMediaStats>;
  imports: Record<string, unknown>[];
  guestCode: string;
  coupleCode: string;
  csrfToken: string;
}

export default function AdminGalleryEdit() {
  const { gallery, stats, imports, guestCode, coupleCode, csrfToken } = useLoaderData() as unknown as LoaderData;
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
