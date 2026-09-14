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
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr>
              <th style={{ padding: "12px", borderBottom: "1px solid var(--gold-light)" }}>Mariés</th>
              <th style={{ padding: "12px", borderBottom: "1px solid var(--gold-light)" }}>ID Public</th>
              <th style={{ padding: "12px", borderBottom: "1px solid var(--gold-light)" }}>Date du Mariage</th>
              <th style={{ padding: "12px", borderBottom: "1px solid var(--gold-light)" }}>Statut</th>
              <th style={{ padding: "12px", borderBottom: "1px solid var(--gold-light)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {galleries.map(g => (
              <tr key={g.id}>
                <td style={{ padding: "12px", borderBottom: "1px solid rgba(186, 153, 107, 0.2)" }}>{g.bride_names}</td>
                <td style={{ padding: "12px", borderBottom: "1px solid rgba(186, 153, 107, 0.2)" }}>{g.public_id}</td>
                <td style={{ padding: "12px", borderBottom: "1px solid rgba(186, 153, 107, 0.2)" }}>{new Date(g.wedding_date).toLocaleDateString()}</td>
                <td style={{ padding: "12px", borderBottom: "1px solid rgba(186, 153, 107, 0.2)" }}>
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    background: g.status === "published" ? "rgba(40, 167, 69, 0.1)" : "rgba(255, 193, 7, 0.1)",
                    color: g.status === "published" ? "#28a745" : "#ffc107"
                  }}>
                    {g.status === "published" ? "Publiée" : "Brouillon"}
                  </span>
                </td>
                <td style={{ padding: "12px", borderBottom: "1px solid rgba(186, 153, 107, 0.2)" }}>
                  <Link to={`/admin/galleries/${g.id}`} className={styles.button}>Modifier</Link>
                </td>
              </tr>
            ))}
            {galleries.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "30px", fontStyle: "italic", color: "var(--grey)" }}>
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
