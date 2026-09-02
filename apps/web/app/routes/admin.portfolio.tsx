import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect,
} from "react-router";
import { Form, Link, useLoaderData, useNavigation } from "react-router";
import { getPortfolioContent, reorderProjects, deleteEmptyProject, type Project } from "../lib/portfolio-content.server";
import { requireValidAdminSession, validateAdminFormData, ActionSecurityError } from "../lib/admin-auth.server";
import { RevisionConflictError, CorruptedContentError } from "../lib/site-content.server";
import styles from "./admin.module.css";
import * as crypto from "node:crypto";
import { commitSession } from "../lib/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireValidAdminSession(request);
  const portfolio = getPortfolioContent();

  let csrfToken = session.get("csrfToken");
  const headers = new Headers();
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    session.set("csrfToken", csrfToken);
    headers.set("Set-Cookie", await commitSession(session));
  }

  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");

  const sortedProjects = [...portfolio.projects].sort((a, b) => a.order - b.order);
  const revision = portfolio.revision;

  return Response.json(
    { projects: sortedProjects, csrfToken, revision },
    { headers }
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");

  let formData: FormData;
  try {
    formData = await validateAdminFormData(request);
  } catch (err: unknown) {
    if (err instanceof ActionSecurityError) {
      return Response.json({ error: err.message }, { status: err.status, headers });
    }
    return Response.json({ error: "Bad Request" }, { status: 400, headers });
  }

  const intent = formData.get("intent");
  if (typeof intent !== "string") return Response.json({ error: "Invalid intent" }, { status: 422, headers });

  const previousRevision = formData.get("revision");
  if (typeof previousRevision !== "string") return Response.json({ error: "Invalid revision" }, { status: 422, headers });

  const projectId = formData.get("projectId");
  if (typeof projectId !== "string") return Response.json({ error: "Invalid project ID" }, { status: 422, headers });

  if (intent === "delete") {
    try {
      deleteEmptyProject(projectId, previousRevision);
      return redirect("/admin/portfolio", { headers });
    } catch (err: unknown) {
      if (err instanceof RevisionConflictError) {
        return Response.json({ error: "Revision conflict" }, { status: 409, headers });
      }
      if (err instanceof CorruptedContentError) {
        return Response.json({ error: "Corrupted content" }, { status: 409, headers });
      }
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg === "Project not found") return Response.json({ error: "Project not found" }, { status: 404, headers });
      if (msg === "Cannot delete a project that contains photos") return Response.json({ error: "Cannot delete a project that contains photos" }, { status: 422, headers });
      return Response.json({ error: "Internal Server Error" }, { status: 500, headers });
    }
  }

  if (intent === "move_up" || intent === "move_down") {
    try {
      const portfolio = getPortfolioContent();
      const sorted = [...portfolio.projects].sort((a, b) => a.order - b.order);
      const index = sorted.findIndex(p => p.id === projectId);

      if (index === -1) return Response.json({ error: "Project not found" }, { status: 404, headers });
      if (intent === "move_up" && index > 0) {
        const temp = sorted[index];
        sorted[index] = sorted[index - 1];
        sorted[index - 1] = temp;
      } else if (intent === "move_down" && index < sorted.length - 1) {
        const temp = sorted[index];
        sorted[index] = sorted[index + 1];
        sorted[index + 1] = temp;
      }

      reorderProjects(sorted.map(p => p.id), previousRevision);
      return redirect("/admin/portfolio", { headers });
    } catch (err: unknown) {
      if (err instanceof RevisionConflictError) {
        return Response.json({ error: "Revision conflict" }, { status: 409, headers });
      }
      if (err instanceof CorruptedContentError) {
        return Response.json({ error: "Corrupted content" }, { status: 409, headers });
      }
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg === "Project not found") return Response.json({ error: "Project not found" }, { status: 404, headers });
      return Response.json({ error: "Internal Server Error" }, { status: 500, headers });
    }
  }

  return Response.json({ error: "Bad Request" }, { status: 400, headers });
}

export default function AdminPortfolio() {
  const { projects, csrfToken, revision } = useLoaderData() as unknown as { projects: Project[]; csrfToken: string; revision: string };
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>Portfolio Public</h1>
          <p className={styles.headerSubtitle}>Gérez les projets de mariage</p>
        </div>
        <div className={styles.projectActions}>
          <Link to="/admin" className={`${styles.logoutButton} ${styles.noDecoration}`}>
            Retour
          </Link>
          <Link to="/admin/portfolio/watermark" className={`${styles.actionButton} ${styles.actionButtonSecondary} ${styles.noDecoration}`}>
            Filigrane
          </Link>
          <Link to="/admin/portfolio/new" className={`${styles.logoutButton} ${styles.noDecoration}`}>
            + Nouveau Projet
          </Link>
        </div>
      </header>
      <main className={styles.mainContent}>
        {projects.length === 0 ? (
          <div className={styles.dashboardCard}>
            <p>Aucun projet pour le moment.</p>
          </div>
        ) : (
          <ul className={styles.projectList}>
            {projects.map((p, index) => (
              <li key={p.id} className={`${styles.dashboardCard} ${styles.projectListItem}`}>
                <div>
                  <h3>{p.title.fr} / {p.title.en}</h3>
                  <p>Statut : <strong>{p.status}</strong></p>
                  <p>Modifié le : {new Date(p.updatedAt).toLocaleString()}</p>
                </div>
                <div className={styles.projectActions}>
                  <Form method="post" className={styles.formActions}>
                    <input type="hidden" name="csrfToken" value={csrfToken} />
                    <input type="hidden" name="revision" value={revision} />
                    <input type="hidden" name="projectId" value={p.id} />

                    <button type="submit" name="intent" value="move_up" disabled={index === 0 || isSubmitting} className={styles.actionButton} aria-label={`Monter le projet ${p.title.fr}`}>
                      Monter
                    </button>
                    <button type="submit" name="intent" value="move_down" disabled={index === projects.length - 1 || isSubmitting} className={styles.actionButton} aria-label={`Descendre le projet ${p.title.fr}`}>
                      Descendre
                    </button>
                    <button type="submit" name="intent" value="delete" disabled={isSubmitting} className={styles.actionButton} aria-label={`Supprimer le projet ${p.title.fr}`} onClick={(e) => {
                      if (!confirm("Supprimer ce projet ?")) e.preventDefault();
                    }}>
                      Supprimer
                    </button>
                  </Form>

                  <Link to={`/admin/portfolio/${p.id}`} className={styles.actionButton}>
                    Modifier
                  </Link>
                  <Link to={`/admin/portfolio/${p.id}/preview`} className={`${styles.actionButton} ${styles.actionButtonSecondary}`}>
                    Aperçu
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
