import {
  type LoaderFunctionArgs,
} from "react-router";
import { Link, useLoaderData } from "react-router";
import { getProjectById, type Project } from "../lib/portfolio-content.server";
import { requireValidAdminSession } from "../lib/admin-auth.server";
import styles from "./admin.module.css";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireValidAdminSession(request);
  const projectId = params.projectId;
  if (!projectId) throw new Response("Not Found", { status: 404 });

  const project = getProjectById(projectId);
  if (!project) throw new Response("Not Found", { status: 404 });

  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");

  return Response.json({ project }, { headers });
}

export default function AdminPortfolioPreview() {
  const { project } = useLoaderData() as unknown as { project: Project };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>Aperçu du Projet (Brouillon)</h1>
          <p className={styles.headerSubtitle}>Vérifiez les métadonnées</p>
        </div>
        <Link to="/admin/portfolio" className={styles.logoutButton} style={{ textDecoration: 'none' }}>
          Retour
        </Link>
      </header>
      <main className={styles.mainContent}>
        <div className={styles.dashboardCard}>
          <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '4px', marginBottom: '2rem' }}>
            <p><strong>Attention :</strong> Ceci est un aperçu sécurisé. Le projet n'est pas visible par le public s'il est en brouillon.</p>
            <p>Aucune photo n'est encore disponible dans ce projet (fonctionnalité prévue dans la prochaine phase).</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div>
              <h3>Version Française</h3>
              <p><strong>Titre :</strong> {project.title.fr}</p>
              <p><strong>Slug :</strong> {project.slug.fr}</p>
              <p><strong>Description :</strong></p>
              <p style={{ whiteSpace: 'pre-wrap', backgroundColor: '#eee', padding: '1rem' }}>{project.description.fr}</p>
            </div>

            <div>
              <h3>Version Anglaise</h3>
              <p><strong>Titre :</strong> {project.title.en}</p>
              <p><strong>Slug :</strong> {project.slug.en}</p>
              <p><strong>Description :</strong></p>
              <p style={{ whiteSpace: 'pre-wrap', backgroundColor: '#eee', padding: '1rem' }}>{project.description.en}</p>
            </div>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <h3>Détails communs</h3>
            <p><strong>Lieu :</strong> {project.location || "Non spécifié"}</p>
            <p><strong>Date :</strong> {project.date || "Non spécifiée"}</p>
            <p><strong>Statut :</strong> {project.status}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
