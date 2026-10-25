import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type HeadersFunction,
} from "react-router";
import { useState, useEffect, useRef } from "react";
import { Form, Link, useLoaderData, useActionData, useNavigation, useFetcher } from "react-router";
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

interface RegenerateOneResponse {
  success?: boolean;
  done?: boolean;
  processedPhotoId?: string;
  totalPhotos?: number;
  upToDatePhotos?: number;
  outdatedPhotos?: number;
  portfolioRevision?: string;
  error?: string;
}

export type RegenState = "idle" | "confirming" | "running" | "success" | "error";

export default function AdminPortfolioWatermark() {
  const loaderData = useLoaderData() as unknown as LoaderData;
  const actionData = useActionData() as unknown as ActionData | undefined;
  const navigation = useNavigation();
  const fetcher = useFetcher<RegenerateOneResponse>();

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

  const [regenState, setRegenState] = useState<RegenState>("idle");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [regenErrorMessage, setRegenErrorMessage] = useState<string | null>(null);

  // Refs for deterministic state machine and StrictMode deduplication
  const lastHandledRevisionRef = useRef<string | null>(null);
  const currentRevisionRef = useRef<string>(activePortfolioRevision);
  const processedCountRef = useRef<number>(0);
  const totalToProcessRef = useRef<number>(0);

  // Keep currentRevisionRef synchronized with activePortfolioRevision
  useEffect(() => {
    currentRevisionRef.current = activePortfolioRevision;
  }, [activePortfolioRevision]);

  // When watermark text is updated via the main form action, update revision and reset regen state
  useEffect(() => {
    if (actionData?.portfolioRevision) {
      setActivePortfolioRevision(actionData.portfolioRevision);
      currentRevisionRef.current = actionData.portfolioRevision;
    }
    if (actionData?.success) {
      setRegenState("idle");
      setRegenErrorMessage(null);
    }
  }, [actionData]);

  // When loaderData updates (revalidation), synchronize counts and revision if idle
  useEffect(() => {
    if (regenState === "idle") {
      setCounts({
        total: loaderData.totalPhotos,
        upToDate: loaderData.upToDatePhotos,
        outdated: loaderData.outdatedPhotos,
      });
      if (!actionData?.portfolioRevision) {
        setActivePortfolioRevision(loaderData.portfolioRevision);
        currentRevisionRef.current = loaderData.portfolioRevision;
      }
    }
  }, [
    loaderData.totalPhotos,
    loaderData.upToDatePhotos,
    loaderData.outdatedPhotos,
    loaderData.portfolioRevision,
    regenState,
    actionData?.portfolioRevision,
  ]);

  // Regeneration loop effect driven by fetcher state & data
  useEffect(() => {
    if (regenState !== "running") return;
    if (fetcher.state !== "idle") return;
    if (!fetcher.data) return;

    const data = fetcher.data;

    // Guard against double processing under React StrictMode or re-renders
    if (data.portfolioRevision && data.portfolioRevision === lastHandledRevisionRef.current) {
      return;
    }

    if (data.error || !data.success) {
      setRegenState("error");
      setRegenErrorMessage(data.error || "Erreur lors de la régénération.");
      return;
    }

    if (!data.portfolioRevision) {
      setRegenState("error");
      setRegenErrorMessage("Réponse serveur invalide (révision manquante).");
      return;
    }

    // Mark this response revision as handled
    lastHandledRevisionRef.current = data.portfolioRevision;

    // Update revision
    setActivePortfolioRevision(data.portfolioRevision);
    currentRevisionRef.current = data.portfolioRevision;

    // Update progress
    processedCountRef.current += 1;
    const currentProcessed = processedCountRef.current;
    const total = totalToProcessRef.current || (data.totalPhotos ?? currentProcessed);
    setProgress({ current: currentProcessed, total });

    // Update counts
    if (
      typeof data.totalPhotos === "number" &&
      typeof data.upToDatePhotos === "number" &&
      typeof data.outdatedPhotos === "number"
    ) {
      setCounts({
        total: data.totalPhotos,
        upToDate: data.upToDatePhotos,
        outdated: data.outdatedPhotos,
      });
    }

    // Check completion
    if (data.done === true || data.outdatedPhotos === 0) {
      setRegenState("success");
      return;
    }

    // Submit next photo with new portfolio revision
    fetcher.submit(
      {
        intent: "regenerate_one",
        csrfToken,
        portfolioRevision: data.portfolioRevision,
      },
      { method: "POST" }
    );
  }, [regenState, fetcher.state, fetcher.data, csrfToken, fetcher]);

  const handleStartRegeneration = () => {
    if (counts.outdated <= 0 || regenState === "running" || isSubmitting) return;

    setRegenState("confirming");
    const confirmed = window.confirm(
      `Voulez-vous régénérer le filigrane pour les ${counts.outdated} photo(s) existante(s) ?`
    );
    if (!confirmed) {
      setRegenState("idle");
      return;
    }

    const totalToProcess = counts.outdated;
    totalToProcessRef.current = totalToProcess;
    processedCountRef.current = 0;
    lastHandledRevisionRef.current = null;
    setRegenErrorMessage(null);
    setProgress({ current: 0, total: totalToProcess });
    setRegenState("running");

    fetcher.submit(
      {
        intent: "regenerate_one",
        csrfToken,
        portfolioRevision: currentRevisionRef.current,
      },
      { method: "POST" }
    );
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
                disabled={regenState === "running"}
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

            <button
              type="submit"
              className={styles.submitButton}
              disabled={isSubmitting || regenState === "running"}
            >
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

            {regenState === "error" && regenErrorMessage && (
              <p className={styles.error} id="regeneration-error-message" role="alert">
                {regenErrorMessage}
              </p>
            )}

            {regenState === "success" && (
              <p
                id="regeneration-success-message"
                role="status"
                className={styles.successMessage}
              >
                Les filigranes des photos existantes ont été régénérés.
              </p>
            )}

            {regenState === "running" && progress && (
              <div className={styles.regenProgressBox}>
                <p className={styles.progressText} id="regeneration-status">
                  {`Régénération en cours : ${progress.current} / ${progress.total} photos traitées...`}
                </p>
                {progress.total > 0 && (
                  <progress
                    className={styles.progressBar}
                    value={progress.current}
                    max={progress.total}
                    aria-valuenow={progress.current}
                    aria-valuemin={0}
                    aria-valuemax={progress.total}
                    aria-label="Progression de la régénération du filigrane"
                  />
                )}
              </div>
            )}

            {regenState !== "running" && counts.outdated === 0 && (
              <p className={styles.regenNotice} id="all-photos-uptodate-message">
                Toutes les photos sont déjà à jour avec le filigrane actuel.
              </p>
            )}

            <div className={styles.regenActions}>
              <button
                type="button"
                id="regenerate-watermarks-button"
                className={styles.submitButton}
                onClick={handleStartRegeneration}
                disabled={counts.outdated === 0 || regenState === "running" || regenState === "confirming" || regenState === "success" || isSubmitting}
              >
                {regenState === "running" ? "Régénération en cours…" : "Régénérer le filigrane des photos existantes"}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
