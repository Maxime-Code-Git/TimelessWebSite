import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type HeadersFunction,
} from "react-router";
import { useState, useEffect } from "react";
import { Form, Link, useLoaderData, useActionData, useNavigation } from "react-router";
import { getPortfolioContent, updateWatermarkText } from "../lib/portfolio-content.server";
import { regenerateNextOutdatedPhoto } from "../lib/portfolio-transaction.server";
import { SafeImageError } from "../lib/portfolio-image.server";
import { requireValidAdminSession, validateAdminFormData, ActionSecurityError } from "../lib/admin-auth.server";
import { RevisionConflictError, CorruptedContentError, ValidationError } from "../lib/site-content.server";
import styles from "./admin.module.css";
import * as crypto from "node:crypto";
import { commitSession } from "../lib/session.server";

export const headers: HeadersFunction = () => ({
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
});

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireValidAdminSession(request);
  const portfolio = getPortfolioContent();

  let csrfToken = session.get("csrfToken");
  const responseHeaders = new Headers();
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    session.set("csrfToken", csrfToken);
    responseHeaders.set("Set-Cookie", await commitSession(session));
  }

  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("X-Robots-Tag", "noindex, nofollow");

  const watermarkRev = portfolio.watermark.revision;
  const totalPhotos = portfolio.photos.length;
  const upToDatePhotos = portfolio.photos.filter(p => p.appliedWatermarkRevision === watermarkRev).length;
  const outdatedPhotos = totalPhotos - upToDatePhotos;

  return Response.json(
    {
      watermarkText: portfolio.watermark.text,
      portfolioRevision: portfolio.revision,
      watermarkRevision: portfolio.watermark.revision,
      csrfToken,
      totalPhotos,
      upToDatePhotos,
      outdatedPhotos,
    },
    { headers: responseHeaders }
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const responseHeaders = new Headers();
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("X-Robots-Tag", "noindex, nofollow");

  let formData: FormData;
  try {
    formData = await validateAdminFormData(request);
  } catch (err: unknown) {
    if (err instanceof Response) {
      throw err;
    }
    if (err instanceof ActionSecurityError) {
      return Response.json({ error: err.message }, { status: err.status, headers: responseHeaders });
    }
    return Response.json({ error: "Bad Request" }, { status: 400, headers: responseHeaders });
  }

  const intent = formData.get("intent");

  if (intent === "regenerate_one") {
    const previousRevision = formData.get("portfolioRevision");
    if (typeof previousRevision !== "string") {
      return Response.json({ error: "Invalid revision" }, { status: 422, headers: responseHeaders });
    }

    const targetPhotoId = formData.get("photoId");
    const photoIdStr = typeof targetPhotoId === "string" && targetPhotoId ? targetPhotoId : undefined;

    try {
      const result = await regenerateNextOutdatedPhoto(previousRevision, { photoId: photoIdStr });
      return Response.json(result, { headers: responseHeaders });
    } catch (err: unknown) {
      if (err instanceof RevisionConflictError) {
        return Response.json({ error: "Revision conflict" }, { status: 409, headers: responseHeaders });
      }
      if (err instanceof CorruptedContentError) {
        return Response.json({ error: "Corrupted content" }, { status: 409, headers: responseHeaders });
      }
      if (err instanceof SafeImageError) {
        return Response.json({ error: err.message }, { status: 422, headers: responseHeaders });
      }
      return Response.json({ error: "Image processing failed due to an internal error." }, { status: 500, headers: responseHeaders });
    }
  }

  // Default intent: update watermark text
  const text = formData.get("watermarkText");
  if (typeof text !== "string") {
    return Response.json({ error: "Invalid watermark text" }, { status: 422, headers: responseHeaders });
  }

  const previousRevision = formData.get("portfolioRevision");
  if (typeof previousRevision !== "string") {
    return Response.json({ error: "Invalid revision" }, { status: 422, headers: responseHeaders });
  }

  try {
    const { portfolioRevision, watermarkRevision } = updateWatermarkText(text, previousRevision);
    return Response.json({ success: true, portfolioRevision, watermarkRevision }, { headers: responseHeaders });
  } catch (err: unknown) {
    if (err instanceof RevisionConflictError) {
      return Response.json({ error: "Revision conflict" }, { status: 409, headers: responseHeaders });
    }
    if (err instanceof CorruptedContentError) {
      return Response.json({ error: "Corrupted content" }, { status: 409, headers: responseHeaders });
    }
    if (err instanceof ValidationError) {
      return Response.json({ error: err.message }, { status: 422, headers: responseHeaders });
    }
    return Response.json({ error: "Internal Server Error" }, { status: 500, headers: responseHeaders });
  }
}

interface LoaderData {
  watermarkText: string;
  portfolioRevision: string;
  watermarkRevision: string;
  csrfToken: string;
  totalPhotos: number;
  upToDatePhotos: number;
  outdatedPhotos: number;
}

interface ActionData {
  success?: boolean;
  portfolioRevision?: string;
  watermarkRevision?: string;
  error?: string;
}

export default function AdminPortfolioWatermark() {
  const loaderData = useLoaderData() as unknown as LoaderData;
  const actionData = useActionData() as unknown as ActionData | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const { watermarkText, csrfToken } = loaderData;

  const [activePortfolioRevision, setActivePortfolioRevision] = useState(
    actionData?.portfolioRevision ?? loaderData.portfolioRevision
  );

  const [counts, setCounts] = useState({
    total: loaderData.totalPhotos,
    upToDate: loaderData.upToDatePhotos,
    outdated: loaderData.outdatedPhotos,
  });

  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenProgress, setRegenProgress] = useState<{ current: number; total: number } | null>(null);
  const [regenStatusMessage, setRegenStatusMessage] = useState<string | null>(null);
  const [regenFinalMessage, setRegenFinalMessage] = useState<string | null>(null);
  const [regenErrorMessage, setRegenErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (actionData?.portfolioRevision) {
      setActivePortfolioRevision(actionData.portfolioRevision);
    } else {
      setActivePortfolioRevision(loaderData.portfolioRevision);
    }
  }, [actionData?.portfolioRevision, loaderData.portfolioRevision]);

  useEffect(() => {
    setCounts({
      total: loaderData.totalPhotos,
      upToDate: loaderData.upToDatePhotos,
      outdated: loaderData.outdatedPhotos,
    });
  }, [loaderData.totalPhotos, loaderData.upToDatePhotos, loaderData.outdatedPhotos, loaderData.watermarkRevision]);

  const handleStartRegeneration = async () => {
    if (counts.outdated <= 0 || isRegenerating) return;

    const confirmed = window.confirm(
      `Voulez-vous régénérer le filigrane pour les ${counts.outdated} photo(s) existante(s) ?`
    );
    if (!confirmed) return;

    setIsRegenerating(true);
    setRegenErrorMessage(null);
    setRegenFinalMessage(null);
    const totalToProcess = counts.outdated;
    setRegenProgress({ current: 0, total: totalToProcess });
    setRegenStatusMessage(`Régénération en cours : 0 / ${totalToProcess} photos traitées...`);

    let currentRev = activePortfolioRevision;
    let processed = 0;
    let errors = 0;

    try {
      while (true) {
        const body = new URLSearchParams();
        body.set("intent", "regenerate_one");
        body.set("csrfToken", csrfToken);
        body.set("portfolioRevision", currentRev);

        const res = await fetch("/admin/portfolio/watermark", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        });

        if (!res.ok) {
          let errMsg = "Erreur lors de la régénération.";
          try {
            const errData = await res.json();
            if (errData.error) errMsg = errData.error;
          } catch {
            // ignore JSON parse error
          }
          errors++;
          setRegenErrorMessage(`Interruption : ${errMsg}`);
          break;
        }

        const data = await res.json();
        if (!data.success) {
          errors++;
          setRegenErrorMessage(data.error || "Erreur lors du traitement.");
          break;
        }

        currentRev = data.portfolioRevision;
        setActivePortfolioRevision(currentRev);
        processed++;
        setRegenProgress({ current: processed, total: totalToProcess });
        setRegenStatusMessage(`Régénération en cours : ${processed} / ${totalToProcess} photos traitées...`);
        setCounts({
          total: data.totalPhotos,
          upToDate: data.upToDatePhotos,
          outdated: data.outdatedPhotos,
        });

        if (data.done || data.outdatedPhotos === 0) {
          break;
        }
      }

      if (errors === 0) {
        setRegenFinalMessage(`Régénération terminée : ${processed} photo(s) régénérée(s) avec succès.`);
        setRegenStatusMessage(null);
      } else {
        setRegenStatusMessage(`Régénération arrêtée : ${processed} photo(s) traitée(s), ${errors} erreur(s).`);
      }
    } catch (err: unknown) {
      setRegenErrorMessage(`Erreur réseau : ${err instanceof Error ? err.message : "Erreur de connexion"}`);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>Filigrane du Portfolio</h1>
          <p className={styles.headerSubtitle}>Configurez le texte du filigrane</p>
        </div>
        <div className={styles.projectActions}>
          <Link to="/admin/portfolio" className={`${styles.logoutButton} ${styles.noDecoration}`}>
            Retour
          </Link>
        </div>
      </header>
      <main className={styles.mainContent}>
        <div className={`${styles.dashboardCard} ${styles.projectFormCard}`}>
          {actionData?.error && (
            <p className={styles.error}>{actionData.error}</p>
          )}
          {actionData?.success && (
            <p className={styles.successMessage}>Filigrane mis à jour avec succès.</p>
          )}

          <Form method="post" className={styles.form}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="portfolioRevision" value={activePortfolioRevision} />

            <div>
              <label htmlFor="watermarkText" className={styles.label}>Texte du filigrane (max. 40 caractères)</label>
              <input
                id="watermarkText"
                type="text"
                name="watermarkText"
                defaultValue={watermarkText}
                maxLength={40}
                className={styles.input}
                disabled={isRegenerating}
                required
              />
              <p className={styles.helpText}>Ce texte sera superposé sur toutes les photos du portfolio.</p>
            </div>

            <div className={styles.watermarkPreviewSection}>
              <h3 className={styles.dashboardTitle}>Aperçu approximatif</h3>
              <div className={styles.watermarkPreviewGrid}>
                <div className={styles.watermarkPreviewLight}>
                  <span className={styles.watermarkPreviewText}>{watermarkText}</span>
                </div>
                <div className={styles.watermarkPreviewDark}>
                  <span className={styles.watermarkPreviewText}>{watermarkText}</span>
                </div>
              </div>
            </div>

            <button type="submit" className={styles.submitButton} disabled={isSubmitting || isRegenerating}>
              {isSubmitting ? "Enregistrement…" : "Enregistrer le filigrane"}
            </button>
          </Form>

          {/* Section: Photos watermark status and progressive regeneration */}
          <section className={styles.regenSection}>
            <h2 className={styles.dashboardTitle}>État du filigrane des photos</h2>
            <p className={styles.helpText}>
              Après modification du texte ci-dessus, les photos déjà importées conservent leur ancien filigrane jusqu’à ce que vous lanciez la régénération.
            </p>

            <div className={styles.watermarkStatsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Total photos</div>
                <div className={styles.statValue} id="total-photos-count">{counts.total}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>À jour</div>
                <div className={`${styles.statValue} ${styles.statValueSuccess}`} id="uptodate-photos-count">
                  {counts.upToDate}
                </div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>À régénérer</div>
                <div
                  className={`${styles.statValue} ${counts.outdated > 0 ? styles.statValueWarning : ""}`}
                  id="outdated-photos-count"
                >
                  {counts.outdated}
                </div>
              </div>
            </div>

            {regenErrorMessage && (
              <p className={styles.error} id="regeneration-error-message">{regenErrorMessage}</p>
            )}
            {regenFinalMessage && (
              <p className={styles.successMessage} id="regeneration-success-message">{regenFinalMessage}</p>
            )}

            {isRegenerating && (
              <div className={styles.regenProgressBox}>
                <p className={styles.progressText} id="regeneration-status">{regenStatusMessage}</p>
                {regenProgress && regenProgress.total > 0 && (
                  <progress
                    className={styles.progressBar}
                    value={regenProgress.current}
                    max={regenProgress.total}
                  />
                )}
              </div>
            )}

            {!isRegenerating && counts.outdated === 0 && (
              <p className={styles.regenNotice} id="all-photos-uptodate-message">
                Toutes les photos sont déjà à jour avec le filigrane actuel.
              </p>
            )}

            <div style={{ marginTop: "1rem" }}>
              <button
                type="button"
                id="regenerate-watermarks-button"
                className={styles.submitButton}
                onClick={handleStartRegeneration}
                disabled={counts.outdated === 0 || isRegenerating || isSubmitting}
              >
                {isRegenerating ? "Régénération en cours…" : "Régénérer le filigrane des photos existantes"}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
