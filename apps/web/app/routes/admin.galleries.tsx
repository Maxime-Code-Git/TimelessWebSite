import { requireValidAdminSession } from "~/lib/admin-auth.server";
import { getGalleryDb } from "~/lib/gallery-db.server";
import type { Route } from "./+types/admin.galleries";
import { Link } from "react-router";
import styles from "./admin.module.css";

export function meta() {
  return [{ title: "Sempra Admin — Galeries" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireValidAdminSession(request);
  const db = getGalleryDb();
  const galleries = db.prepare("SELECT id, public_id, bride_names, wedding_date, status, created_at FROM galleries ORDER BY created_at DESC").all() as Array<{ id: string, public_id: string, bride_names: string, wedding_date: string, status: string, created_at: string }>;

  return { galleries };
}

export default function AdminGalleries({ loaderData }: Route.ComponentProps) {
  const { galleries } = loaderData;

  return (
    <div className={styles.adminPage}>
      <div className={styles.headerRow}>
        <h2>Galeries Clients</h2>
        <Link to="/admin/galleries/new" className={styles.button}>Nouvelle Galerie</Link>
      </div>

      <div className={styles.card}>
        <table className={styles.galleryTable}>
          <thead>
            <tr>
              <th className={styles.galleryTh}>Mariés</th>
              <th className={styles.galleryTh}>ID Public</th>
              <th className={styles.galleryTh}>Date du Mariage</th>
              <th className={styles.galleryTh}>Statut</th>
              <th className={styles.galleryTh}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {galleries.map(g => (
              <tr key={g.id}>
                <td className={styles.galleryTd}>{g.bride_names}</td>
                <td className={styles.galleryTd}>{g.public_id}</td>
                <td className={styles.galleryTd}>{new Date(g.wedding_date).toLocaleDateString()}</td>
                <td className={styles.galleryTd}>
                  <span className={`${styles.statusBadge} ${
                    g.status === 'draft' ? styles.statusDraft :
                    g.status === 'published' ? styles.statusPublished :
                    styles.statusArchived
                  }`}>
                    {g.status}
                  </span>
                </td>
                <td className={styles.galleryTd}>
                  <Link to={`/admin/galleries/${g.id}`} className={styles.button}>Modifier</Link>
                </td>
              </tr>
            ))}
            {galleries.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.emptyStateRow}>
                  Aucune galerie. Créez-en une !
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
