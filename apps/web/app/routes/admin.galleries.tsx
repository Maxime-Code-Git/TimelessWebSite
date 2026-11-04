import { requireValidAdminSession } from "~/lib/admin-auth.server";
import { getGalleryDb } from "~/lib/gallery-db.server";
import type { Route } from "./+types/admin.galleries";
import { Link } from "react-router";
import styles from "./admin.module.css";
import { formatEuropeanDate } from "~/lib/date";

export function meta() {
  return [{ title: "Sempra Admin | Galeries" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireValidAdminSession(request);
  const db = getGalleryDb();
  const galleries = db.prepare(`
    SELECT g.id, g.public_id, g.bride_names, g.wedding_date, g.status, g.created_at,
           COUNT(m.id) as media_count
    FROM galleries g
    LEFT JOIN gallery_media m ON m.gallery_id = g.id
    GROUP BY g.id
    ORDER BY g.created_at DESC
  `).all() as Array<{
    id: string;
    public_id: string;
    bride_names: string;
    wedding_date: string;
    status: string;
    created_at: number;
    media_count: number;
  }>;

  return { galleries };
}

export default function AdminGalleries({ loaderData }: Route.ComponentProps) {
  const { galleries } = loaderData;

  return (
    <div className={styles.adminPage}>
      <div className={styles.galleryHeaderParallax} style={{ marginBottom: "1.5rem" }}>
        <div className={styles.galleryHeaderLeft}>
          <div className={styles.galleryHeaderTitleRow}>
            <Link to="/admin" className={styles.backLink}>
              ← Administration
            </Link>
            <h1 className={styles.galleryHeaderTitle}>Galeries Clients</h1>
          </div>
          <p className={styles.helperText} style={{ margin: 0 }}>
            {galleries.length} galerie(s) configurée(s)
          </p>
        </div>
        <div className={styles.galleryHeaderActions}>
          <Link to="/admin/galleries/new" className={styles.submitButton}>
            + Nouvelle Galerie
          </Link>
        </div>
      </div>

      <div className={`${styles.card} ${styles.galleryTableCard}`}>
        <div className={styles.galleryTableWrapper}>
          <table className={styles.galleryTable}>
            <thead>
              <tr>
                <th className={styles.galleryTh}>Mariés</th>
                <th className={styles.galleryTh}>Date du Mariage</th>
                <th className={styles.galleryTh}>Médias</th>
                <th className={styles.galleryTh}>Statut</th>
                <th className={styles.galleryTh}>ID Public</th>
                <th className={styles.galleryTh}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {galleries.map(g => (
                <tr key={g.id}>
                  <td className={styles.galleryTd}>
                    <strong>{g.bride_names}</strong>
                  </td>
                  <td className={styles.galleryTd}>
                    {formatEuropeanDate(g.wedding_date, "fr")}
                  </td>
                  <td className={styles.galleryTd}>
                    <span className={styles.helperText}>
                      {g.media_count} média(s)
                    </span>
                  </td>
                  <td className={styles.galleryTd}>
                    <span className={`${styles.statusPill} ${
                      g.status === "published" ? styles.statusPillPublished :
                      g.status === "draft" ? styles.statusPillDraft :
                      styles.statusPillArchived
                    }`}>
                      {g.status === "published" ? "Publiée" : g.status === "draft" ? "Brouillon" : "Archivée"}
                    </span>
                  </td>
                  <td className={styles.galleryTd}>
                    <code>{g.public_id}</code>
                  </td>
                  <td className={styles.galleryTd}>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <Link to={`/admin/galleries/${g.id}`} className={styles.button}>
                        Modifier
                      </Link>
                      <a
                        href={`/galerie/${g.public_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.button}
                        style={{ padding: "0.35rem 0.6rem", fontSize: "0.8125rem" }}
                        title="Ouvrir la vue client"
                      >
                        ↗
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {galleries.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.emptyStateRow}>
                    Aucune galerie pour le moment. Créez votre première galerie !
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
