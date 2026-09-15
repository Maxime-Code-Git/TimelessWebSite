import { Form, Link, useActionData, useNavigation, redirect, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireValidAdminSession, validateAdminFormData, createAdminHeaders, ActionSecurityError } from "../lib/admin-auth.server";
import { createGallery } from "../lib/gallery.server";
import { addCalendarMonths } from "../lib/date";
import { startGalleryImport, getAvailableImportFolders } from "../lib/gallery-import.server";
import styles from "./admin.module.css";
import { commitSession } from "../lib/session.server";
import crypto from "node:crypto";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireValidAdminSession(request);
  const folders = getAvailableImportFolders();

  const headers = createAdminHeaders();
  let csrfToken = session.get("csrfToken");
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    session.set("csrfToken", csrfToken);
    headers.set("Set-Cookie", await commitSession(session));
  }

  return Response.json({ folders, csrfToken }, { headers });
}

export async function action({ request }: ActionFunctionArgs) {
  let formData: FormData;
  try {
    formData = await validateAdminFormData(request);
  } catch (err) {
    if (err instanceof ActionSecurityError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }

  const bride_names = String(formData.get("bride_names"));
  const wedding_date = String(formData.get("wedding_date"));
  const location = formData.get("location") ? String(formData.get("location")) : undefined;
  const expiresStr = formData.get("expires_at");
  let expires_at: number | undefined;
  if (expiresStr) {
    const d = new Date(String(expiresStr));
    if (isNaN(d.getTime()) || d.getTime() <= Date.now()) {
      return Response.json({ error: "La date d'expiration doit être future et valide." }, { status: 400 });
    }
    expires_at = d.getTime();
  }

  const importFolder = formData.get("importFolder");

  if (!bride_names || !wedding_date) {
    return Response.json({ error: "Noms et date obligatoires." }, { status: 400 });
  }

  const gallery = createGallery({
    bride_names,
    wedding_date,
    location,
    expires_at
  });

  if (importFolder && typeof importFolder === "string" && importFolder.length > 0) {
    startGalleryImport(gallery.id, importFolder);
  }

  return redirect(`/admin/galleries/${gallery.id}`);
}

interface LoaderData {
  folders: string[];
  csrfToken: string;
}

export default function AdminGalleryNew() {
  const { folders, csrfToken } = useLoaderData() as unknown as LoaderData;
  const actionData = useActionData<{ error?: string }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const defaultExpires = addCalendarMonths(new Date(), 24).toISOString().split("T")[0];

  return (
    <div className={styles.adminPage}>
      <div className={styles.headerRow}>
        <h2>Nouvelle galerie client</h2>
        <Link to="/admin/galleries" className={styles.button}>Retour</Link>
      </div>

      <Form method="post" className={styles.form}>
        <input type="hidden" name="csrfToken" value={csrfToken} />

        <div className={styles.formGroup}>
          <label className={styles.label}>Noms des mariés</label>
          <input type="text" name="bride_names" className={styles.input} required placeholder="Ex: Sophie & Marc" />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Date du mariage</label>
          <input type="text" name="wedding_date" className={styles.input} required placeholder="Ex: 15 Juillet 2026" />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Lieu (optionnel)</label>
          <input type="text" name="location" className={styles.input} placeholder="Ex: Château de la Loire" />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Date d'expiration</label>
          <input type="date" name="expires_at" className={styles.input} defaultValue={defaultExpires} />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Dossier d'import (optionnel)</label>
          <select name="importFolder" className={styles.input}>
            <option value="">-- Ne pas importer de photos pour l'instant --</option>
            {folders.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        {actionData?.error && (
          <p className={styles.errorText} role="alert">{actionData.error}</p>
        )}

        <button type="submit" disabled={isSubmitting} className={styles.submitButton}>
          {isSubmitting ? "Création..." : "Créer la galerie"}
        </button>
      </Form>
    </div>
  );
}
