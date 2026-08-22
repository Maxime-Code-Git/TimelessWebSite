import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getRawSiteContent, saveSettings, RevisionConflictError, ValidationError } from "../lib/site-content.server";
import { requireValidAdminSession, validateAdminFormData, createAdminHeaders, ActionSecurityError } from "../lib/admin-auth.server";
import { commitSession } from "../lib/session.server";
import * as crypto from "node:crypto";
import styles from "./admin.module.css";
import type { BusinessContent } from "../lib/site-content.server";
import { useState } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireValidAdminSession(request);
  const { content, isCorrupted } = getRawSiteContent();

  const headers = createAdminHeaders();
  let csrfToken = session.get("csrfToken");
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    session.set("csrfToken", csrfToken);
    headers.set("Set-Cookie", await commitSession(session));
  }

  return Response.json(
    { business: content.business, revision: content.revision, csrfToken, storageWarning: isCorrupted },
    { headers }
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const { isCorrupted } = getRawSiteContent();
  if (isCorrupted) {
    return Response.json({ error: "Le stockage du contenu doit être vérifié avant toute modification." }, { status: 409 });
  }

  try {
    const formData = await validateAdminFormData(request);
    const revision = String(formData.get("revision"));

    const businessJson = String(formData.get("business"));

    let parsedBusiness: BusinessContent;
    try {
      parsedBusiness = JSON.parse(businessJson);
    } catch {
      return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    try {
      const newRev = saveSettings(parsedBusiness, revision);
      return Response.json({ success: true, revision: newRev });
    } catch (e: any) {
      if (e instanceof RevisionConflictError) {
        return Response.json(
          { error: "Conflit de révision : quelqu'un a modifié les données entre-temps. Veuillez rafraîchir." },
          { status: 409 }
        );
      }
      if (e instanceof ValidationError) {
        return Response.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
  } catch (e: any) {
    if (e instanceof ActionSecurityError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export default function AdminSettingsPage() {
  const { business, revision, csrfToken, storageWarning } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string; success?: boolean; revision?: string }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [data, setData] = useState<BusinessContent>(business);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name.startsWith("serviceArea.")) {
      const lang = name.split(".")[1] as "fr" | "en";
      setData({ ...data, serviceArea: { ...data.serviceArea, [lang]: value } });
    } else {
      setData({ ...data, [name]: value === "" ? null : name === "depositPercent" ? Number(value) : value });
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <Link to="/admin" className={styles.backLink}>← Retour au tableau de bord</Link>
          <h1 className={styles.headerTitle}>Textes et informations</h1>
        </div>
      </header>

      <main className={styles.mainContent}>
        <div className={styles.dashboardCard}>
          <p className={styles.dashboardText}>
            Cette interface permet de modifier les informations de contact, les mentions légales et les liens sociaux.
          </p>

          <Form method="post" className={styles.formContainer}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="revision" value={actionData?.revision || revision} />
            <input type="hidden" name="business" value={JSON.stringify(data)} />

            {storageWarning && (
              <div className={styles.error} role="alert">Le stockage du contenu doit être vérifié avant toute modification.</div>
            )}
            {actionData?.error && <div className={styles.error} role="alert">{actionData.error}</div>}
            {actionData?.success && !actionData?.error && <div className={styles.success} role="status">Informations mises à jour avec succès.</div>}

            <div className={styles.settingsGrid}>
              <div className={styles.settingsSection}>
                <h3>Contact</h3>
                <div className={styles.formGroup}>
                  <label htmlFor="email" className={styles.label}>Email public</label>
                  <input id="email" type="email" name="email" value={data.email || ""} onChange={handleChange} className={styles.input} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="phoneDisplay" className={styles.label}>Téléphone (affichage)</label>
                  <input id="phoneDisplay" type="text" name="phoneDisplay" value={data.phoneDisplay || ""} onChange={handleChange} className={styles.input} placeholder="+32 477 86 37 42" />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="phoneE164" className={styles.label}>Téléphone (E164)</label>
                  <input id="phoneE164" type="text" name="phoneE164" value={data.phoneE164 || ""} onChange={handleChange} className={styles.input} placeholder="+32477863742" />
                  <small className={styles.helperText}>Ex: +32477863742 (sans espaces)</small>
                </div>
              </div>

              <div className={styles.settingsSection}>
                <h3>Réseaux Sociaux</h3>
                <div className={styles.formGroup}>
                  <label htmlFor="instagramUrl" className={styles.label}>Instagram (URL HTTPS)</label>
                  <input id="instagramUrl" type="url" name="instagramUrl" value={data.instagramUrl || ""} onChange={handleChange} className={styles.input} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="linkedinUrl" className={styles.label}>LinkedIn (URL HTTPS)</label>
                  <input id="linkedinUrl" type="url" name="linkedinUrl" value={data.linkedinUrl || ""} onChange={handleChange} className={styles.input} />
                </div>
              </div>

              <div className={styles.settingsSection}>
                <h3>Studio & Mentions Légales</h3>
                <div className={styles.formGroup}>
                  <label htmlFor="address" className={styles.label}>Adresse du studio</label>
                  <textarea id="address" name="address" value={data.address || ""} onChange={handleChange} className={styles.textarea} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="enterpriseNumber" className={styles.label}>Numéro d'entreprise</label>
                  <input id="enterpriseNumber" type="text" name="enterpriseNumber" value={data.enterpriseNumber || ""} onChange={handleChange} className={styles.input} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="legalForm" className={styles.label}>Forme légale</label>
                  <input id="legalForm" type="text" name="legalForm" value={data.legalForm || ""} onChange={handleChange} className={styles.input} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="legalRepresentative" className={styles.label}>Représentant légal</label>
                  <input id="legalRepresentative" type="text" name="legalRepresentative" value={data.legalRepresentative || ""} onChange={handleChange} className={styles.input} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="hostingProvider" className={styles.label}>Hébergeur (Nom)</label>
                  <input id="hostingProvider" type="text" name="hostingProvider" value={data.hostingProvider || ""} onChange={handleChange} className={styles.input} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="hostingAddress" className={styles.label}>Hébergeur (Adresse)</label>
                  <textarea id="hostingAddress" name="hostingAddress" value={data.hostingAddress || ""} onChange={handleChange} className={styles.textarea} />
                </div>
              </div>

              <div className={styles.settingsSection}>
                <h3>Paramètres commerciaux</h3>
                <div className={styles.formGroup}>
                  <label htmlFor="depositPercent" className={styles.label}>Acompte (%)</label>
                  <input id="depositPercent" type="number" name="depositPercent" value={data.depositPercent || ""} onChange={handleChange} min="0" max="100" className={styles.input} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="serviceAreaFr" className={styles.label}>Zone d'intervention (FR)</label>
                  <input id="serviceAreaFr" type="text" name="serviceArea.fr" value={data.serviceArea.fr || ""} onChange={handleChange} required className={styles.input} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="serviceAreaEn" className={styles.label}>Zone d'intervention (EN)</label>
                  <input id="serviceAreaEn" type="text" name="serviceArea.en" value={data.serviceArea.en || ""} onChange={handleChange} required className={styles.input} />
                </div>
              </div>
            </div>

            <button type="submit" disabled={isSubmitting || storageWarning} className={styles.submitButton}>
              {isSubmitting ? "Enregistrement..." : "Enregistrer les modifications"}
            </button>
          </Form>
        </div>
      </main>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 401) {
    return null;
  }

  return (
    <div className={styles.errorContainer}>
      <div className={styles.errorBox}>
        <h1 className={styles.errorTitle}>Erreur</h1>
        <p className={styles.errorText}>
          Impossible de charger cette page.
        </p>
        <Link to="/admin" className="btn btn--outline">Retour au tableau de bord</Link>
      </div>
    </div>
  );
}
