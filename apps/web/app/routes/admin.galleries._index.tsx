import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { requireValidAdminSession, createAdminHeaders } from "../lib/admin-auth.server";
import { getGalleries } from "../lib/gallery.server";
import styles from "./admin.module.css";
import { commitSession } from "../lib/session.server";
import crypto from "node:crypto";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireValidAdminSession(request);
  const galleries = getGalleries();

  const headers = createAdminHeaders();
  let csrfToken = session.get("csrfToken");
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    session.set("csrfToken", csrfToken);
    headers.set("Set-Cookie", await commitSession(session));
  }

  return Response.json({ galleries, csrfToken }, { headers });
}

interface LoaderData {
  galleries: ReturnType<typeof getGalleries>;
  csrfToken: string;
}

export default function AdminGalleries() {
  const { galleries } = useLoaderData() as unknown as LoaderData;
  const now = Date.now();

  return (
    <div className={styles.adminPage}>
      <div className={styles.headerRow}>
        <h2>Galeries clients</h2>
        <Link to="/admin/galleries/new" className={styles.submitButton}>Nouvelle galerie</Link>
      </div>
      <p className={styles.helperText}>Gérez ici les espaces privés de vos clients.</p>

      <div className={styles.grid}>
        {galleries.map(g => (
          <div key={g.id} className={styles.card}>
            <h3>{g.bride_names}</h3>
            <p><strong>Date :</strong> {g.wedding_date}</p>
            <p>
              <strong>Statut :</strong> {g.status === 'published' ? "Publié" : g.status === 'archived' ? "Archivé" : "Brouillon"}
            </p>
            <p>
              <strong>Expiration :</strong> {new Date(g.expires_at).toLocaleDateString()}
              {g.expires_at < now && <span className={styles.errorText}> (Expirée)</span>}
            </p>
            <Link to={`/admin/galleries/${g.id}`} className={styles.button}>Gérer</Link>
          </div>
        ))}
        {galleries.length === 0 && (
          <p>Aucune galerie pour le moment.</p>
        )}
      </div>
    </div>
  );
}
