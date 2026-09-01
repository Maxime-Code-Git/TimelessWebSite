import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect,
} from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { getProjectById, getPortfolioContent, updateProjectMetadata, type Project } from "../lib/portfolio-content.server";
import { requireValidAdminSession, validateAdminFormData } from "../lib/admin-auth.server";
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
  const projectId = params.projectId;
  if (!projectId) return new Response("Not Found", { status: 404 });

  const formData = await validateAdminFormData(request);
  const previousRevision = formData.get("revision") as string;

  const titleFr = formData.get("titleFr") as string;
  const titleEn = formData.get("titleEn") as string;
  const slugFr = formData.get("slugFr") as string;
  const slugEn = formData.get("slugEn") as string;
  const descriptionFr = formData.get("descriptionFr") as string;
  const descriptionEn = formData.get("descriptionEn") as string;
  const location = formData.get("location") as string || null;
  const date = formData.get("date") as string || null;
  const status = formData.get("status") as "draft" | "published";

  try {
    updateProjectMetadata(projectId, {
      title: { fr: titleFr, en: titleEn },
      slug: { fr: slugFr, en: slugEn },
      description: { fr: descriptionFr, en: descriptionEn },
      location,
      date,
      status,
    }, previousRevision);

    return redirect(`/admin/portfolio`);
  } catch (err: any) {
    if (err.name === "RevisionConflictError") {
      return new Response("Revision conflict", { status: 409 });
    }
    return Response.json({ error: err.message }, { status: 400 });
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
        <Link to="/admin/portfolio" className={styles.logoutButton} style={{ textDecoration: 'none' }}>
          Retour
        </Link>
      </header>
      <main className={styles.mainContent}>
        <div className={styles.loginCard} style={{ maxWidth: '800px' }}>
          <Form method="post" className={styles.form}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="revision" value={revision} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className={styles.label}>Titre (FR)</label>
                <input name="titleFr" required defaultValue={project.title.fr} className={styles.input} />
              </div>
              <div>
                <label className={styles.label}>Titre (EN)</label>
                <input name="titleEn" required defaultValue={project.title.en} className={styles.input} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className={styles.label}>Slug (FR)</label>
                <input name="slugFr" required defaultValue={project.slug.fr} className={styles.input} />
              </div>
              <div>
                <label className={styles.label}>Slug (EN)</label>
                <input name="slugEn" required defaultValue={project.slug.en} className={styles.input} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className={styles.label}>Description (FR)</label>
                <textarea name="descriptionFr" required defaultValue={project.description.fr} className={styles.input} rows={4} />
              </div>
              <div>
                <label className={styles.label}>Description (EN)</label>
                <textarea name="descriptionEn" required defaultValue={project.description.en} className={styles.input} rows={4} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className={styles.label}>Lieu (Optionnel)</label>
                <input name="location" defaultValue={project.location || ""} className={styles.input} />
              </div>
              <div>
                <label className={styles.label}>Date (Optionnel YYYY-MM-DD)</label>
                <input name="date" type="date" defaultValue={project.date || ""} className={styles.input} />
              </div>
            </div>

            <div>
              <label className={styles.label}>Statut</label>
              <select name="status" defaultValue={project.status} className={styles.input}>
                <option value="draft">Brouillon (Non visible)</option>
                <option value="published">Publié</option>
              </select>
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
