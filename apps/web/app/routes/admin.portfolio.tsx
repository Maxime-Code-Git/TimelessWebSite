import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect,
} from "react-router";
import { Form, Link, useLoaderData, useNavigation } from "react-router";
import { getPortfolioContent, reorderProjects, deleteEmptyProject, type Project } from "../lib/portfolio-content.server";
import { requireValidAdminSession, validateAdminFormData } from "../lib/admin-auth.server";
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
  const formData = await validateAdminFormData(request);
  const intent = formData.get("intent");
  const previousRevision = formData.get("revision") as string;

  if (intent === "delete") {
    const projectId = formData.get("projectId") as string;
    try {
      deleteEmptyProject(projectId, previousRevision);
      return redirect("/admin/portfolio");
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 400 });
    }
  }

  if (intent === "move_up" || intent === "move_down") {
    const projectId = formData.get("projectId") as string;
    const portfolio = getPortfolioContent();
    const sorted = [...portfolio.projects].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex(p => p.id === projectId);

    if (index === -1) return new Response("Not found", { status: 404 });
    if (intent === "move_up" && index > 0) {
      const temp = sorted[index];
      sorted[index] = sorted[index - 1];
      sorted[index - 1] = temp;
    } else if (intent === "move_down" && index < sorted.length - 1) {
      const temp = sorted[index];
      sorted[index] = sorted[index + 1];
      sorted[index + 1] = temp;
    }

    try {
      reorderProjects(sorted.map(p => p.id), previousRevision);
      return redirect("/admin/portfolio");
    } catch (err: any) {
      if (err.name === "RevisionConflictError") {
        return new Response("Revision conflict", { status: 409 });
      }
      return Response.json({ error: err.message }, { status: 400 });
    }
  }

  return new Response("Bad Request", { status: 400 });
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
        <div>
          <Link to="/admin" className={styles.logoutButton} style={{ marginRight: '1rem', textDecoration: 'none' }}>
            Retour
          </Link>
          <Link to="/admin/portfolio/new" className={styles.logoutButton} style={{ textDecoration: 'none' }}>
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
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {projects.map((p, index) => (
              <li key={p.id} className={styles.dashboardCard} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h3>{p.title.fr} / {p.title.en}</h3>
                  <p>Statut : <strong>{p.status}</strong></p>
                  <p>Modifié le : {new Date(p.updatedAt).toLocaleString()}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Form method="post" style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="hidden" name="csrfToken" value={csrfToken} />
                    <input type="hidden" name="revision" value={revision} />
                    <input type="hidden" name="projectId" value={p.id} />

                    <button type="submit" name="intent" value="move_up" disabled={index === 0 || isSubmitting}>
                      Monter
                    </button>
                    <button type="submit" name="intent" value="move_down" disabled={index === projects.length - 1 || isSubmitting}>
                      Descendre
                    </button>
                    <button type="submit" name="intent" value="delete" disabled={isSubmitting} onClick={(e) => {
                      if (!confirm("Supprimer ce projet ?")) e.preventDefault();
                    }}>
                      Supprimer
                    </button>
                  </Form>

                  <Link to={`/admin/portfolio/${p.id}`} className={styles.submitButton} style={{ padding: '0.25rem 0.5rem', textDecoration: 'none' }}>
                    Modifier
                  </Link>
                  <Link to={`/admin/portfolio/${p.id}/preview`} className={styles.submitButton} style={{ padding: '0.25rem 0.5rem', textDecoration: 'none', backgroundColor: '#666' }}>
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
