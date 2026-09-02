import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type HeadersFunction,
} from "react-router";
import { Form, Link, useLoaderData, useActionData, useNavigation } from "react-router";
import { getPortfolioContent, updateWatermarkText } from "../lib/portfolio-content.server";
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

  return Response.json(
    {
      watermarkText: portfolio.watermark.text,
      revision: portfolio.revision,
      csrfToken,
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
    if (err instanceof ActionSecurityError) {
      return Response.json({ error: err.message }, { status: err.status, headers: responseHeaders });
    }
    return Response.json({ error: "Bad Request" }, { status: 400, headers: responseHeaders });
  }

  const text = formData.get("watermarkText");
  if (typeof text !== "string") {
    return Response.json({ error: "Invalid watermark text" }, { status: 422, headers: responseHeaders });
  }

  const previousRevision = formData.get("revision");
  if (typeof previousRevision !== "string") {
    return Response.json({ error: "Invalid revision" }, { status: 422, headers: responseHeaders });
  }

  try {
    const newRevision = updateWatermarkText(text, previousRevision);
    return Response.json({ success: true, revision: newRevision }, { headers: responseHeaders });
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
  revision: string;
  csrfToken: string;
}

interface ActionData {
  success?: boolean;
  revision?: string;
  error?: string;
}

export default function AdminPortfolioWatermark() {
  const { watermarkText, revision, csrfToken } = useLoaderData() as unknown as LoaderData;
  const actionData = useActionData() as unknown as ActionData | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const currentRevision = actionData?.revision ?? revision;
  const currentText = actionData?.success ? (actionData as ActionData & { success: true }).revision ? watermarkText : watermarkText : watermarkText;

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
            <input type="hidden" name="revision" value={currentRevision} />

            <div>
              <label htmlFor="watermarkText" className={styles.label}>Texte du filigrane (max. 40 caractères)</label>
              <input
                id="watermarkText"
                type="text"
                name="watermarkText"
                defaultValue={currentText}
                maxLength={40}
                className={styles.input}
                required
              />
              <p className={styles.helpText}>Ce texte sera superposé sur toutes les photos du portfolio.</p>
            </div>

            <div className={styles.watermarkPreviewSection}>
              <h3 className={styles.dashboardTitle}>Aperçu approximatif</h3>
              <div className={styles.watermarkPreviewGrid}>
                <div className={styles.watermarkPreviewLight}>
                  <span className={styles.watermarkPreviewText}>{currentText}</span>
                </div>
                <div className={styles.watermarkPreviewDark}>
                  <span className={styles.watermarkPreviewText}>{currentText}</span>
                </div>
              </div>
            </div>

            <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
              {isSubmitting ? "Enregistrement…" : "Enregistrer le filigrane"}
            </button>
          </Form>
        </div>
      </main>
    </div>
  );
}
