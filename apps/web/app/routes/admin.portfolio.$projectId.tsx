import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect,
} from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { getProjectById, getPortfolioContent, updateProjectMetadata, type Project } from "../lib/portfolio-content.server";
import { requireValidAdminSession, validateAdminFormData, ActionSecurityError } from "../lib/admin-auth.server";
import { RevisionConflictError, CorruptedContentError } from "../lib/site-content.server";
import styles from "./admin.module.css";
import * as crypto from "node:crypto";
import { commitSession } from "../lib/session.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const session = await requireValidAdminSession(request);
  const projectId = params.projectId;
  if (!projectId) throw new Response("Not Found", { status: 404 });

  const project = getProjectById(projectId);
  if (!project) throw new Response("Not Found", { status: 404 });

  let csrfToken = session.get("csrfToken");
  const headers = new Headers();
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    session.set("csrfToken", csrfToken);
    headers.set("Set-Cookie", await commitSession(session));
  }

  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");

  const revision = getPortfolioContent().revision;

  return Response.json({ project, csrfToken, revision }, { headers });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");

  const projectId = params.projectId;
  if (!projectId) return Response.json({ error: "Not Found" }, { status: 404, headers });

  let formData: FormData;
  try {
    formData = await validateAdminFormData(request);
  } catch (err: unknown) {
    if (err instanceof ActionSecurityError) {
      return Response.json({ error: err.message }, { status: err.status, headers });
    }
    return Response.json({ error: "Bad Request" }, { status: 400, headers });
  }

  const previousRevision = formData.get("revision");
  if (typeof previousRevision !== "string") return Response.json({ error: "Invalid revision" }, { status: 422, headers });

  const titleFr = formData.get("titleFr");
  const titleEn = formData.get("titleEn");
  const slugFr = formData.get("slugFr");
  const slugEn = formData.get("slugEn");
  const descriptionFr = formData.get("descriptionFr");
  const descriptionEn = formData.get("descriptionEn");
  const location = formData.get("location");
  const date = formData.get("date");

  if (
    typeof titleFr !== "string" || typeof titleEn !== "string" ||
    typeof descriptionFr !== "string" || typeof descriptionEn !== "string"
  ) {
    return Response.json({ error: "Missing required fields" }, { status: 422, headers });
  }

  try {
    updateProjectMetadata(projectId, {
      title: { fr: titleFr, en: titleEn },
      slug: { fr: typeof slugFr === "string" ? slugFr : "", en: typeof slugEn === "string" ? slugEn : "" },
      description: { fr: descriptionFr, en: descriptionEn },
      location: typeof location === "string" && location.trim() ? location : null,
      date: typeof date === "string" && date.trim() ? date : null,
    }, previousRevision);

    return redirect(`/admin/portfolio`, { headers });
  } catch (err: unknown) {
    if (err instanceof RevisionConflictError) {
      return Response.json({ error: "Revision conflict" }, { status: 409, headers });
    }
    if (err instanceof CorruptedContentError) {
      return Response.json({ error: "Corrupted content" }, { status: 409, headers });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Project not found") {
      return Response.json({ error: "Project not found" }, { status: 404, headers });
    }
    if (msg.includes("is already used")) {
      return Response.json({ error: msg }, { status: 422, headers });
    }
    return Response.json({ error: "Validation failed" }, { status: 422, headers });
  }
}

export default function AdminPortfolioEdit() {
  const { project, csrfToken, revision } = useLoaderData() as unknown as { project: Project; csrfToken: string; revision: string };
  const actionData = useActionData<{ error?: string }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>Modifier le Projet</h1>
          <p className={styles.headerSubtitle}>{project.title.fr}</p>
        </div>
        <Link to="/admin/portfolio" className={`${styles.logoutButton} ${styles.noDecoration}`}>
          Retour
        </Link>
      </header>
      <main className={styles.mainContent}>
        <div className={`${styles.loginCard} ${styles.projectFormCard || ''}`}>
          <Form method="post" className={styles.form}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="revision" value={revision} />

            <div className={styles.grid}>
              <div>
                <label htmlFor="titleFr" className={styles.label}>Titre (FR)</label>
                <input id="titleFr" name="titleFr" required defaultValue={project.title.fr} className={styles.input} />
              </div>
              <div>
                <label htmlFor="titleEn" className={styles.label}>Titre (EN)</label>
                <input id="titleEn" name="titleEn" required defaultValue={project.title.en} className={styles.input} />
              </div>
            </div>

            <div className={styles.grid}>
              <div>
                <label htmlFor="slugFr" className={styles.label}>Slug (FR)</label>
                <input id="slugFr" name="slugFr" required defaultValue={project.slug.fr} className={styles.input} />
              </div>
              <div>
                <label htmlFor="slugEn" className={styles.label}>Slug (EN)</label>
                <input id="slugEn" name="slugEn" required defaultValue={project.slug.en} className={styles.input} />
              </div>
            </div>

            <div className={styles.grid}>
              <div>
                <label htmlFor="descriptionFr" className={styles.label}>Description (FR)</label>
                <textarea id="descriptionFr" name="descriptionFr" required defaultValue={project.description.fr} className={styles.input} rows={4} />
              </div>
              <div>
                <label htmlFor="descriptionEn" className={styles.label}>Description (EN)</label>
                <textarea id="descriptionEn" name="descriptionEn" required defaultValue={project.description.en} className={styles.input} rows={4} />
              </div>
            </div>

            <div className={styles.grid}>
              <div>
                <label htmlFor="location" className={styles.label}>Lieu (Optionnel)</label>
                <input id="location" name="location" defaultValue={project.location || ""} className={styles.input} />
              </div>
              <div>
                <label htmlFor="date" className={styles.label}>Date (Optionnel YYYY-MM-DD)</label>
                <input id="date" name="date" type="date" defaultValue={project.date || ""} className={styles.input} />
              </div>
            </div>

            <div>
              <p className={styles.label}>Statut</p>
              <p className={styles.helpText}>
                Brouillon (Non visible). La publication sera disponible après l'ajout réel des photos.
              </p>
            </div>

            {actionData?.error && (
              <p className={styles.error} role="alert">
                {actionData.error}
              </p>
            )}

            <button type="submit" disabled={isSubmitting} className={styles.submitButton}>
              {isSubmitting ? "Sauvegarde..." : "Enregistrer les modifications"}
            </button>
          </Form>
        </div>
      </main>
    </div>
  );
}
