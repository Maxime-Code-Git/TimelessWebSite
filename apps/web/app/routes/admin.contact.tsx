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
import { getRawSiteContent, saveContactPageSettings, RevisionConflictError, ValidationError, CorruptedContentError } from "../lib/site-content.server";
import { requireValidAdminSession, validateAdminFormData, createAdminHeaders, ActionSecurityError } from "../lib/admin-auth.server";
import { commitSession } from "../lib/session.server";
import * as crypto from "node:crypto";
import styles from "./admin.module.css";
import type { ContactPageContent } from "../lib/site-content.server";
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
    { contactPage: content.contactPage, revision: content.revision, csrfToken, storageWarning: isCorrupted },
    { headers }
  );
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const formData = await validateAdminFormData(request);
    const revision = String(formData.get("revision"));

    const contactJson = String(formData.get("contactPage"));

    let parsedContactPage: ContactPageContent;
    try {
      parsedContactPage = JSON.parse(contactJson);
    } catch {
      return Response.json({ error: "Invalid JSON payload" }, { status: 422 });
    }

    try {
      const newRev = saveContactPageSettings(parsedContactPage, revision);
      return Response.json({ success: true, revision: newRev });
    } catch (e: unknown) {
      if (e instanceof CorruptedContentError) {
        return Response.json(
          { error: "Le stockage du contenu doit être vérifié avant toute modification." },
          { status: 409 }
        );
      }
      if (e instanceof RevisionConflictError) {
        return Response.json(
          { error: "Conflit de révision : quelqu'un a modifié les données entre-temps. Veuillez rafraîchir." },
          { status: 409 }
        );
      }
      if (e instanceof ValidationError) {
        return Response.json({ error: e.message }, { status: 422 });
      }
      throw e;
    }
  } catch (e: unknown) {
    if (e instanceof ActionSecurityError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}


interface FieldProps {
  path: string;
  label: string;
  type?: "text" | "textarea";
  data: ContactPageContent;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

const Field = ({ path, label, type = "text", data, onChange }: FieldProps) => {
  const value = (path.split('.').reduce((o: unknown, i) => (o as Record<string, unknown>)?.[i], data as unknown) as string) || "";
  return (
    <div className={styles.formGroup}>
      <label htmlFor={path} className={styles.label}>{label}</label>
      {type === "textarea" ? (
        <textarea id={path} name={path} value={value} onChange={onChange} className={styles.textarea} />
      ) : (
        <input id={path} type="text" name={path} value={value} onChange={onChange} className={styles.input} />
      )}
    </div>
  );
};

export default function AdminContactPage() {
  const { contactPage, revision, csrfToken, storageWarning } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string; success?: boolean; revision?: string }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [data, setData] = useState<ContactPageContent>(contactPage);
  const [lang, setLang] = useState<"fr" | "en">("fr");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const parts = name.split(".");

    setData(prev => {
      const newData = structuredClone(prev) as ContactPageContent;
      let current: Record<string, unknown> = newData as unknown as Record<string, unknown>;
      for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;
      return newData;
    });
  };



  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <Link to="/admin" className={styles.backLink}>← Retour au tableau de bord</Link>
          <h1 className={styles.headerTitle}>Page Contact</h1>
        </div>
      </header>

      <main className={styles.mainContent}>
        <div className={styles.dashboardCard}>
          <p className={styles.dashboardText}>
            Gérer tous les textes FR/EN de la page Contact.
          </p>

          <div className={styles.tabs}>
            <button className={`${styles.tabBtn} ${lang === 'fr' ? styles.activeTab : ''}`} onClick={() => setLang('fr')}>Français</button>
            <button className={`${styles.tabBtn} ${lang === 'en' ? styles.activeTab : ''}`} onClick={() => setLang('en')}>English</button>
          </div>

          <Form method="post" className={styles.formContainer}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="revision" value={actionData?.revision || revision} />
            <input type="hidden" name="contactPage" value={JSON.stringify(data)} />

            {storageWarning && (
              <div className={styles.error} role="alert">Le stockage du contenu doit être vérifié avant toute modification.</div>
            )}
            {actionData?.error && <div className={styles.error} role="alert">{actionData.error}</div>}
            {actionData?.success && !actionData?.error && <div className={styles.success} role="status">Informations mises à jour avec succès.</div>}

            <div className={styles.settingsGrid}>
              <div className={styles.settingsSection}>
                <h3>SEO</h3>
                <Field data={data} onChange={handleChange} path={`seo.title.${lang}`} label="Titre SEO" />
                <Field data={data} onChange={handleChange} path={`seo.description.${lang}`} label="Description SEO" type="textarea" />
              </div>

              <div className={styles.settingsSection}>
                <h3>Hero</h3>
                <Field data={data} onChange={handleChange} path={`hero.title.${lang}`} label="Titre principal" />
                <Field data={data} onChange={handleChange} path={`hero.subtitle.${lang}`} label="Sous-titre" type="textarea" />
              </div>

              <div className={styles.settingsSection}>
                <h3>Bandeau d’introduction</h3>
                <Field data={data} onChange={handleChange} path={`introBanner.title.${lang}`} label="Titre" />
                <Field data={data} onChange={handleChange} path={`introBanner.subtitle.${lang}`} label="Sous-titre" type="textarea" />
                <Field data={data} onChange={handleChange} path={`introBanner.badges.0.label.${lang}`} label="Badge 1 (ex: 30 minutes)" />
                <Field data={data} onChange={handleChange} path={`introBanner.badges.1.label.${lang}`} label="Badge 2 (ex: Sans engagement)" />
                <Field data={data} onChange={handleChange} path={`introBanner.badges.2.label.${lang}`} label="Badge 3 (ex: En visio)" />
              </div>

              <div className={styles.settingsSection}>
                <h3>Introduction de la réservation</h3>
                <Field data={data} onChange={handleChange} path={`bookingIntro.overtitle.${lang}`} label="Petit titre" />
                <Field data={data} onChange={handleChange} path={`bookingIntro.title.${lang}`} label="Titre" />
                <Field data={data} onChange={handleChange} path={`bookingIntro.description.${lang}`} label="Description" type="textarea" />
                <Field data={data} onChange={handleChange} path={`bookingIntro.note.${lang}`} label="Note (jours disponibles)" />
              </div>

              <div className={styles.settingsSection}>
                <h3>Interface de réservation visio</h3>
                <Field data={data} onChange={handleChange} path={`visioBooking.title.${lang}`} label="Titre" />
                <Field data={data} onChange={handleChange} path={`visioBooking.unavailableMsg.${lang}`} label="Message (aucun créneau)" type="textarea" />
                <Field data={data} onChange={handleChange} path={`visioBooking.selectDate.${lang}`} label="Libellé sélection date" />
                <Field data={data} onChange={handleChange} path={`visioBooking.selectTime.${lang}`} label="Libellé sélection heure" />
                <Field data={data} onChange={handleChange} path={`visioBooking.timezone.${lang}`} label="Indication fuseau horaire" />
                <Field data={data} onChange={handleChange} path={`visioBooking.formTitle.${lang}`} label="Titre coordonnées" />
                <Field data={data} onChange={handleChange} path={`visioBooking.labelNames.${lang}`} label="Libellé noms" />
                <Field data={data} onChange={handleChange} path={`visioBooking.labelEmail.${lang}`} label="Libellé e-mail" />
                <Field data={data} onChange={handleChange} path={`visioBooking.labelPhone.${lang}`} label="Libellé téléphone" />
                <Field data={data} onChange={handleChange} path={`visioBooking.labelWeddingDate.${lang}`} label="Libellé date mariage" />
                <Field data={data} onChange={handleChange} path={`visioBooking.labelFormula.${lang}`} label="Libellé formule" />
                <Field data={data} onChange={handleChange} path={`visioBooking.labelMessage.${lang}`} label="Libellé message" />

                <h4>Options Formules</h4>
                <Field data={data} onChange={handleChange} path={`visioBooking.formulas.photo.${lang}`} label="Option Photo" />
                <Field data={data} onChange={handleChange} path={`visioBooking.formulas.film.${lang}`} label="Option Film" />
                <Field data={data} onChange={handleChange} path={`visioBooking.formulas.duo.${lang}`} label="Option Duo" />
                <Field data={data} onChange={handleChange} path={`visioBooking.formulas.custom.${lang}`} label="Option Sur mesure" />
                <Field data={data} onChange={handleChange} path={`visioBooking.formulas.unknown.${lang}`} label="Option Je ne sais pas encore" />

                <h4>Boutons & États</h4>
                <Field data={data} onChange={handleChange} path={`visioBooking.btnSubmit.${lang}`} label="Bouton envoi" />
                <Field data={data} onChange={handleChange} path={`visioBooking.btnSubmitting.${lang}`} label="Texte pendant l'envoi" />
                <Field data={data} onChange={handleChange} path={`visioBooking.successTitle.${lang}`} label="Titre confirmation" />
                <Field data={data} onChange={handleChange} path={`visioBooking.successMsg.${lang}`} label="Message confirmation" type="textarea" />
                <Field data={data} onChange={handleChange} path={`visioBooking.btnNewRequest.${lang}`} label="Bouton nouvelle demande" />
                <Field data={data} onChange={handleChange} path={`visioBooking.errTaken.${lang}`} label="Erreur: créneau pris" type="textarea" />
                <Field data={data} onChange={handleChange} path={`visioBooking.errGeneric.${lang}`} label="Erreur: générique" type="textarea" />
                <Field data={data} onChange={handleChange} path={`visioBooking.loadingMsg.${lang}`} label="Texte de chargement" />
              </div>

              <div className={styles.settingsSection}>
                <h3>Formulaire de contact</h3>
                <Field data={data} onChange={handleChange} path={`contactForm.formPrompt.${lang}`} label="Texte d'introduction" type="textarea" />
                <Field data={data} onChange={handleChange} path={`contactForm.successMsg.${lang}`} label="Message de succès" type="textarea" />
                <Field data={data} onChange={handleChange} path={`contactForm.btnSubmitting.${lang}`} label="Texte bouton envoi (en cours)" />

                <h4>Libellés</h4>
                <Field data={data} onChange={handleChange} path={`contactForm.labels.names.${lang}`} label="Noms" />
                <Field data={data} onChange={handleChange} path={`contactForm.labels.email.${lang}`} label="E-mail" />
                <Field data={data} onChange={handleChange} path={`contactForm.labels.phone.${lang}`} label="Téléphone" />
                <Field data={data} onChange={handleChange} path={`contactForm.labels.date.${lang}`} label="Date" />
                <Field data={data} onChange={handleChange} path={`contactForm.labels.location.${lang}`} label="Lieu" />
                <Field data={data} onChange={handleChange} path={`contactForm.labels.formula.${lang}`} label="Formule" />
                <Field data={data} onChange={handleChange} path={`contactForm.labels.message.${lang}`} label="Message" />
                <Field data={data} onChange={handleChange} path={`contactForm.labels.submit.${lang}`} label="Bouton d'envoi" />

                <h4>Placeholders</h4>
                <Field data={data} onChange={handleChange} path={`contactForm.placeholders.names.${lang}`} label="Noms" />
                <Field data={data} onChange={handleChange} path={`contactForm.placeholders.email.${lang}`} label="E-mail" />
                <Field data={data} onChange={handleChange} path={`contactForm.placeholders.phone.${lang}`} label="Téléphone" />
                <Field data={data} onChange={handleChange} path={`contactForm.placeholders.location.${lang}`} label="Lieu" />
                <Field data={data} onChange={handleChange} path={`contactForm.placeholders.formulaDefault.${lang}`} label="Formule par défaut" />
                <Field data={data} onChange={handleChange} path={`contactForm.placeholders.message.${lang}`} label="Message" />

                <h4>Groupes & Options</h4>
                <Field data={data} onChange={handleChange} path={`contactForm.groupLabels.photo.${lang}`} label="Groupe Photographie" />
                <Field data={data} onChange={handleChange} path={`contactForm.groupLabels.film.${lang}`} label="Groupe Film" />
                <Field data={data} onChange={handleChange} path={`contactForm.groupLabels.duo.${lang}`} label="Groupe Duo" />
                <Field data={data} onChange={handleChange} path={`contactForm.options.custom.${lang}`} label="Option Sur mesure" />
                <Field data={data} onChange={handleChange} path={`contactForm.options.unknown.${lang}`} label="Option Je ne sais pas encore" />
              </div>


              <div className={styles.settingsSection}>
                <h3>Messages d'erreur</h3>
                <Field data={data} onChange={handleChange} path={`contactForm.errors.invalidType.${lang}`} label="Type invalide" />
                <Field data={data} onChange={handleChange} path={`contactForm.errors.invalidRequest.${lang}`} label="Requête invalide" />
                <Field data={data} onChange={handleChange} path={`contactForm.errors.payloadTooLarge.${lang}`} label="Trop volumineux" />
                <Field data={data} onChange={handleChange} path={`contactForm.errors.readError.${lang}`} label="Erreur de lecture" />
                <Field data={data} onChange={handleChange} path={`contactForm.errors.invalidOrigin.${lang}`} label="Origine invalide" />
                <Field data={data} onChange={handleChange} path={`contactForm.errors.requiredFields.${lang}`} label="Champs obligatoires manquants" />
                <Field data={data} onChange={handleChange} path={`contactForm.errors.maxLength.${lang}`} label="Taille maximale dépassée" />
                <Field data={data} onChange={handleChange} path={`contactForm.errors.invalidEmail.${lang}`} label="Email invalide" />
                <Field data={data} onChange={handleChange} path={`contactForm.errors.invalidChars.${lang}`} label="Caractères interdits" />
                <Field data={data} onChange={handleChange} path={`contactForm.errors.invalidFormula.${lang}`} label="Formule invalide" />
                <Field data={data} onChange={handleChange} path={`contactForm.errors.invalidDateFormat.${lang}`} label="Format date invalide" />
                <Field data={data} onChange={handleChange} path={`contactForm.errors.invalidDate.${lang}`} label="Date impossible" />
                <Field data={data} onChange={handleChange} path={`contactForm.errors.invalidPhone.${lang}`} label="Téléphone invalide" />
                <Field data={data} onChange={handleChange} path={`contactForm.errors.invalidNetwork.${lang}`} label="Réseau/IP invalide" />
                <Field data={data} onChange={handleChange} path={`contactForm.errors.rateLimit.${lang}`} label="Limite de tentatives" />
                <Field data={data} onChange={handleChange} path={`contactForm.errors.sendError.${lang}`} label="Erreur envoi" />
              </div>
              <div className={styles.settingsSection}>
                <h3>Bloc coordonnées</h3>
                <Field data={data} onChange={handleChange} path={`contactDetails.title.${lang}`} label="Titre" />
                <Field data={data} onChange={handleChange} path={`contactDetails.labelEmail.${lang}`} label="Libellé E-mail" />
                <Field data={data} onChange={handleChange} path={`contactDetails.labelPhone.${lang}`} label="Libellé Téléphone" />
                <Field data={data} onChange={handleChange} path={`contactDetails.labelArea.${lang}`} label="Libellé Zone d'intervention" />
                <Field data={data} onChange={handleChange} path={`contactDetails.labelSocial.${lang}`} label="Libellé Réseaux" />
                <Field data={data} onChange={handleChange} path={`contactDetails.labelInstagram.${lang}`} label="Libellé Instagram" />
                <Field data={data} onChange={handleChange} path={`contactDetails.labelLinkedin.${lang}`} label="Libellé LinkedIn" />
                <Field data={data} onChange={handleChange} path={`contactDetails.responseTime.${lang}`} label="Texte délai de réponse" />
              </div>

              <div className={styles.settingsSection}>
                <h3>Bandeau inférieur</h3>
                <Field data={data} onChange={handleChange} path={`bottomBanner.text.${lang}`} label="Texte" type="textarea" />
                <Field data={data} onChange={handleChange} path={`bottomBanner.linkLabel.${lang}`} label="Libellé du bouton" />
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
