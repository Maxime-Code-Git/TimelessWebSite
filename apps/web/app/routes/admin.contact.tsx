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
      const newData = JSON.parse(JSON.stringify(prev));
      let current = newData;
      for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return newData;
    });
  };

  const Field = ({ path, label, type = "text" }: { path: string, label: string, type?: "text" | "textarea" }) => {
    const value = (path.split('.').reduce((o: unknown, i) => (o as Record<string, unknown>)?.[i], data as unknown) as string) || "";
    return (
      <div className={styles.formGroup}>
        <label htmlFor={path} className={styles.label}>{label}</label>
        {type === "textarea" ? (
          <textarea id={path} name={path} value={value} onChange={handleChange} className={styles.textarea} />
        ) : (
          <input id={path} type="text" name={path} value={value} onChange={handleChange} className={styles.input} />
        )}
      </div>
    );
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
                <Field path={`seo.title.${lang}`} label="Titre SEO" />
                <Field path={`seo.description.${lang}`} label="Description SEO" type="textarea" />
              </div>

              <div className={styles.settingsSection}>
                <h3>Hero</h3>
                <Field path={`hero.title.${lang}`} label="Titre principal" />
                <Field path={`hero.subtitle.${lang}`} label="Sous-titre" type="textarea" />
              </div>

              <div className={styles.settingsSection}>
                <h3>Bandeau d’introduction</h3>
                <Field path={`introBanner.title.${lang}`} label="Titre" />
                <Field path={`introBanner.subtitle.${lang}`} label="Sous-titre" type="textarea" />
                <Field path={`introBanner.badges.0.label.${lang}`} label="Badge 1 (ex: 30 minutes)" />
                <Field path={`introBanner.badges.1.label.${lang}`} label="Badge 2 (ex: Sans engagement)" />
                <Field path={`introBanner.badges.2.label.${lang}`} label="Badge 3 (ex: En visio)" />
              </div>

              <div className={styles.settingsSection}>
                <h3>Introduction de la réservation</h3>
                <Field path={`bookingIntro.overtitle.${lang}`} label="Petit titre" />
                <Field path={`bookingIntro.title.${lang}`} label="Titre" />
                <Field path={`bookingIntro.description.${lang}`} label="Description" type="textarea" />
                <Field path={`bookingIntro.note.${lang}`} label="Note (jours disponibles)" />
              </div>

              <div className={styles.settingsSection}>
                <h3>Interface de réservation visio</h3>
                <Field path={`visioBooking.title.${lang}`} label="Titre" />
                <Field path={`visioBooking.unavailableMsg.${lang}`} label="Message (aucun créneau)" type="textarea" />
                <Field path={`visioBooking.selectDate.${lang}`} label="Libellé sélection date" />
                <Field path={`visioBooking.selectTime.${lang}`} label="Libellé sélection heure" />
                <Field path={`visioBooking.timezone.${lang}`} label="Indication fuseau horaire" />
                <Field path={`visioBooking.formTitle.${lang}`} label="Titre coordonnées" />
                <Field path={`visioBooking.labelNames.${lang}`} label="Libellé noms" />
                <Field path={`visioBooking.labelEmail.${lang}`} label="Libellé e-mail" />
                <Field path={`visioBooking.labelPhone.${lang}`} label="Libellé téléphone" />
                <Field path={`visioBooking.labelWeddingDate.${lang}`} label="Libellé date mariage" />
                <Field path={`visioBooking.labelFormula.${lang}`} label="Libellé formule" />
                <Field path={`visioBooking.labelMessage.${lang}`} label="Libellé message" />
                
                <h4>Options Formules</h4>
                <Field path={`visioBooking.formulas.photo.${lang}`} label="Option Photo" />
                <Field path={`visioBooking.formulas.film.${lang}`} label="Option Film" />
                <Field path={`visioBooking.formulas.duo.${lang}`} label="Option Duo" />
                <Field path={`visioBooking.formulas.custom.${lang}`} label="Option Sur mesure" />
                <Field path={`visioBooking.formulas.unknown.${lang}`} label="Option Je ne sais pas encore" />

                <h4>Boutons & États</h4>
                <Field path={`visioBooking.btnSubmit.${lang}`} label="Bouton envoi" />
                <Field path={`visioBooking.btnSubmitting.${lang}`} label="Texte pendant l'envoi" />
                <Field path={`visioBooking.successTitle.${lang}`} label="Titre confirmation" />
                <Field path={`visioBooking.successMsg.${lang}`} label="Message confirmation" type="textarea" />
                <Field path={`visioBooking.btnNewRequest.${lang}`} label="Bouton nouvelle demande" />
                <Field path={`visioBooking.errTaken.${lang}`} label="Erreur: créneau pris" type="textarea" />
                <Field path={`visioBooking.errGeneric.${lang}`} label="Erreur: générique" type="textarea" />
                <Field path={`visioBooking.loadingMsg.${lang}`} label="Texte de chargement" />
              </div>

              <div className={styles.settingsSection}>
                <h3>Formulaire de contact</h3>
                <Field path={`contactForm.formPrompt.${lang}`} label="Texte d'introduction" type="textarea" />
                <Field path={`contactForm.successMsg.${lang}`} label="Message de succès" type="textarea" />
                <Field path={`contactForm.btnSubmitting.${lang}`} label="Texte bouton envoi (en cours)" />
                
                <h4>Libellés</h4>
                <Field path={`contactForm.labels.names.${lang}`} label="Noms" />
                <Field path={`contactForm.labels.email.${lang}`} label="E-mail" />
                <Field path={`contactForm.labels.phone.${lang}`} label="Téléphone" />
                <Field path={`contactForm.labels.date.${lang}`} label="Date" />
                <Field path={`contactForm.labels.location.${lang}`} label="Lieu" />
                <Field path={`contactForm.labels.formula.${lang}`} label="Formule" />
                <Field path={`contactForm.labels.message.${lang}`} label="Message" />
                <Field path={`contactForm.labels.submit.${lang}`} label="Bouton d'envoi" />

                <h4>Placeholders</h4>
                <Field path={`contactForm.placeholders.names.${lang}`} label="Noms" />
                <Field path={`contactForm.placeholders.email.${lang}`} label="E-mail" />
                <Field path={`contactForm.placeholders.phone.${lang}`} label="Téléphone" />
                <Field path={`contactForm.placeholders.location.${lang}`} label="Lieu" />
                <Field path={`contactForm.placeholders.formulaDefault.${lang}`} label="Formule par défaut" />
                <Field path={`contactForm.placeholders.formulaSurMesure.${lang}`} label="Sur-mesure" />
                <Field path={`contactForm.placeholders.formulaDontKnow.${lang}`} label="Je ne sais pas" />
                <Field path={`contactForm.placeholders.message.${lang}`} label="Message" />

                <h4>Groupes & Options</h4>
                <Field path={`contactForm.groupLabels.photo.${lang}`} label="Groupe Photographie" />
                <Field path={`contactForm.groupLabels.film.${lang}`} label="Groupe Film" />
                <Field path={`contactForm.groupLabels.duo.${lang}`} label="Groupe Duo" />
                <Field path={`contactForm.options.custom.${lang}`} label="Option Sur mesure" />
                <Field path={`contactForm.options.unknown.${lang}`} label="Option Je ne sais pas encore" />
              </div>

              <div className={styles.settingsSection}>
                <h3>Bloc coordonnées</h3>
                <Field path={`contactDetails.title.${lang}`} label="Titre" />
                <Field path={`contactDetails.labelEmail.${lang}`} label="Libellé E-mail" />
                <Field path={`contactDetails.labelPhone.${lang}`} label="Libellé Téléphone" />
                <Field path={`contactDetails.labelArea.${lang}`} label="Libellé Zone d'intervention" />
                <Field path={`contactDetails.labelSocial.${lang}`} label="Libellé Réseaux" />
                <Field path={`contactDetails.labelInstagram.${lang}`} label="Libellé Instagram" />
                <Field path={`contactDetails.labelLinkedin.${lang}`} label="Libellé LinkedIn" />
                <Field path={`contactDetails.responseTime.${lang}`} label="Texte délai de réponse" />
              </div>

              <div className={styles.settingsSection}>
                <h3>Bandeau inférieur</h3>
                <Field path={`bottomBanner.text.${lang}`} label="Texte" type="textarea" />
                <Field path={`bottomBanner.linkLabel.${lang}`} label="Libellé du bouton" />
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
