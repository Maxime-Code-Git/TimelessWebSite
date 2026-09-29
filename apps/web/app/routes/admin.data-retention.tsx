type Booking = { id: string; email: string; created_at: string; local_date: string; local_time: string; type: string; price: number; status: string; names: string; [key: string]: unknown };
type Gallery = { id: string; bride_names: string; created_at: string | number | Date; expires_at: number; public_id: string; status: string; [key: string]: unknown };
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit
} from "react-router";
import { requireAdminSession } from "../lib/auth.server";
import { createAdminHeaders } from "../lib/admin-auth.server";
import { validateOrigin } from "../lib/security.server";
import { getBookingDb } from "../lib/db-booking.server";
import { getGalleryDb, deleteGalleryAndQuarantine } from "../lib/gallery-db.server";
import styles from "./admin.data-retention.module.css";
import { useState, useRef, useEffect } from "react";
import { constantTimeEqual } from "../lib/auth.server";

export function meta() {
  return [
    { title: "Conservation et suppression des données - Administration" },
    { name: "robots", content: "noindex, nofollow" }
  ];
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { isValid, session } = await requireAdminSession(request);
  if (!isValid) {
    return redirect("/admin");
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";

  const db = getBookingDb();
  let query = "SELECT id, names, email, local_date, local_time, status, starts_at_utc FROM bookings";
  const params: string[] = [];

  if (q) {
    query += " WHERE email LIKE ? OR names LIKE ? OR id = ? OR status = ? OR local_date = ?";
    params.push(`%${q}%`, `%${q}%`, q, q, q);
  }
  query += " ORDER BY local_date DESC LIMIT 100";

  const bookings = db.prepare(query).all(...params) as unknown[];

  const galleryDb = getGalleryDb();
  let gQuery = "SELECT id, public_id, bride_names, wedding_date, status, expires_at FROM galleries";
  const gParams: string[] = [];

  if (q) {
    gQuery += " WHERE public_id LIKE ? OR bride_names LIKE ? OR id = ? OR status = ?";
    gParams.push(`%${q}%`, `%${q}%`, q, q);
  }
  gQuery += " ORDER BY created_at DESC LIMIT 100";

  const galleries = galleryDb.prepare(gQuery).all(...gParams) as unknown[];

  const csrfToken = session.get("csrfToken") ?? "";

  const headers = createAdminHeaders();
  headers.set("Cache-Control", "no-store");

  return Response.json({ bookings, galleries, csrfToken, q }, { headers });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!validateOrigin(request)) {
    return new Response("Forbidden: Invalid Origin", { status: 403 });
  }

  const rawContentType = request.headers.get("content-type") || "";
  const mimeType = rawContentType.split(";")[0]?.trim().toLowerCase();

  if (mimeType !== "application/x-www-form-urlencoded" && mimeType !== "multipart/form-data") {
    return new Response("Unsupported Media Type", { status: 415 });
  }

  const { isValid, session } = await requireAdminSession(request);
  if (!isValid) {
    return new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const formCsrf = String(formData.get("csrfToken") ?? "");
  const sessionCsrf = session.get("csrfToken") ?? "";

  if (!formCsrf || !sessionCsrf || !constantTimeEqual(formCsrf, sessionCsrf)) {
    return new Response("Invalid CSRF token", { status: 403 });
  }

  const intent = formData.get("intent");
  const db = getBookingDb();

  if (intent === "export_booking") {
    const id = String(formData.get("id"));
    const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);
    if (!booking) {
      return new Response("Not found", { status: 404 });
    }
    const json = JSON.stringify(booking, null, 2);
    return new Response(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="booking_export_${id}.json"`,
        "Cache-Control": "no-store",
      }
    });
  }

  if (intent === "delete_booking_single") {
    const id = String(formData.get("id"));
    const confirm = String(formData.get("confirm"));
    if (confirm !== "SUPPRIMER") {
      return Response.json({ error: "Confirmation incorrecte" }, { status: 400 });
    }

    db.exec("BEGIN EXCLUSIVE TRANSACTION;");
    try {
      const info = db.prepare("DELETE FROM bookings WHERE id = ?").run(id);
      db.exec("COMMIT;");
      if (info.changes === 0) {
        return new Response("Not found", { status: 404 });
      }
      return Response.json({ success: true, message: "Rendez-vous supprimé définitivement." });
    } catch {
      db.exec("ROLLBACK;");
      return Response.json({ error: "Erreur lors de la suppression." }, { status: 500 });
    }
  }

  if (intent === "delete_booking_bulk") {
    const idsStr = String(formData.get("ids"));
    const confirm = String(formData.get("confirm"));
    if (confirm !== "SUPPRIMER") {
      return Response.json({ error: "Confirmation incorrecte" }, { status: 400 });
    }

    
    let ids: string[];
    try {
      ids = JSON.parse(idsStr);
      if (!Array.isArray(ids)) throw new Error();
    } catch {
      return Response.json({ error: "Format invalide" }, { status: 400 });
    }

    if (ids.length === 0) {
      return Response.json({ error: "Aucun rendez-vous sélectionné" }, { status: 400 });
    }

    db.exec("BEGIN EXCLUSIVE TRANSACTION;");
    try {
      const now = new Date();
      for (const id of ids) {
        const booking = db.prepare("SELECT status, starts_at_utc FROM bookings WHERE id = ?").get(id) as { status: string, starts_at_utc: string } | undefined;
        if (!booking) continue;

        if ((booking.status === "confirmed" || booking.status === "pending") && new Date(booking.starts_at_utc) > now) {
          db.exec("ROLLBACK;");
          return Response.json({ error: `Impossible de supprimer le rendez-vous futur ${id}` }, { status: 400 });
        }
        db.prepare("DELETE FROM bookings WHERE id = ?").run(id);
      }
      db.exec("COMMIT;");
      return Response.json({ success: true, message: `${ids.length} rendez-vous supprimés définitivement.` });
    } catch {
      db.exec("ROLLBACK;");
      return Response.json({ error: "Erreur lors de la suppression groupée." }, { status: 500 });
    }
  }

  if (intent === "delete_gallery_single") {
    const id = String(formData.get("id"));
    const confirm = String(formData.get("confirm"));
    if (confirm !== "SUPPRIMER") return Response.json({ error: "Confirmation incorrecte" }, { status: 400 });

    try {
      deleteGalleryAndQuarantine(id);
      return Response.json({ success: true, message: "Galerie supprimée et mise en quarantaine." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      return Response.json({ error: msg }, { status: 500 });
    }
  }

  if (intent === "delete_gallery_bulk") {
    const idsStr = String(formData.get("ids"));
    const confirm = String(formData.get("confirm"));
    if (confirm !== "SUPPRIMER") return Response.json({ error: "Confirmation incorrecte" }, { status: 400 });

    
    let idsParsed: string[];
    try {
      idsParsed = JSON.parse(idsStr);
      if (!Array.isArray(idsParsed)) throw new Error();
    } catch {
      return Response.json({ error: "Format invalide" }, { status: 400 });
    }
    if (idsParsed.length === 0) return Response.json({ error: "Aucune galerie sélectionnée" }, { status: 400 });

    let successCount = 0;
    let lastError = "";
    for (const id of idsParsed) {
      try {
        deleteGalleryAndQuarantine(id);
        successCount++;
      } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : "Erreur inconnue";
      }
    }
    if (successCount === 0) {
      return Response.json({ error: "Erreur lors de la suppression groupée de galeries: " + lastError }, { status: 500 });
    }
    return Response.json({ success: true, message: `${successCount} galeries supprimées et mises en quarantaine.` });
  }

  return new Response("Bad Request", { status: 400 });
}

export default function DataRetentionPage() {
  const { bookings, galleries, csrfToken, q } = useLoaderData<{ bookings: Booking[], galleries: Gallery[], csrfToken: string, q: string }>();
  const actionData = useActionData<{ error?: string; success?: boolean; message?: string }>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSubmitting = navigation.state !== "idle";

  const [search, setSearch] = useState(q);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<Set<string>>(new Set());
  
  const [deleteModal, setDeleteModal] = useState<{ 
    isOpen: boolean; 
    id: string | null; 
    multiple: boolean; 
    type: 'booking' | 'gallery';
    triggerElement: HTMLElement | null 
  }>({
    isOpen: false,
    id: null,
    multiple: false,
    type: 'booking',
    triggerElement: null
  });
  
  const confirmInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (deleteModal.isOpen && confirmInputRef.current) {
      confirmInputRef.current.focus();
    }
  }, [deleteModal.isOpen]);

  const toggleSelectAll = () => {
    if (selectedIds.size === bookings.length && bookings.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(bookings.map((b: Booking) => b.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAllGalleries = () => {
    if (selectedGalleryIds.size === galleries.length && galleries.length > 0) {
      setSelectedGalleryIds(new Set());
    } else {
      setSelectedGalleryIds(new Set(galleries.map((g: Gallery) => g.id)));
    }
  };

  const toggleSelectGallery = (id: string) => {
    const newSet = new Set(selectedGalleryIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedGalleryIds(newSet);
  };

  const closeDeleteModal = () => {
    if (deleteModal.triggerElement) {
      deleteModal.triggerElement.focus();
    }
    setDeleteModal({ isOpen: false, id: null, multiple: false, type: 'booking', triggerElement: null });
  };

  const submitDelete = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    submit(formData, { method: "post" });
    closeDeleteModal();
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Conservation et suppression des données</h1>
        <p className={styles.subtitle}>Espace administrateur - RGPD</p>
      </header>

      {actionData?.error && (
        <div className={styles.error} role="alert">
          {actionData.error}
        </div>
      )}
      
      {actionData?.success && (
        <div className={styles.success} role="status">
          {actionData.message}
        </div>
      )}

      <div className={styles.infoBox}>
        <h3>Informations RGPD</h3>
        <ul>
          <li>Aucune suppression automatique n'est active pour le moment.</li>
          <li>Les durées de conservation doivent correspondre à la politique de confidentialité publiée.</li>
          <li>Les e-mails de contact sont stockés dans la messagerie et ne peuvent pas être supprimés d'ici.</li>
          <li>Les sauvegardes ont leur propre durée de conservation.</li>
          <li>La suppression d'une galerie ne supprime jamais le dossier source d'import.</li>
          <li>Une suppression définitive est irréversible (après nettoyage de la quarantaine pour les galeries).</li>
        </ul>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Recherche de rendez-vous</h2>
        
        <Form method="get" className={styles.searchForm}>
          <div className={styles.formGroup}>
            <label htmlFor="q" className={styles.label}>Email, Nom, ID, Statut ou Date</label>
            <input 
              id="q"
              name="q"
              type="text" 
              className={styles.input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
            />
          </div>
          <button type="submit" className={styles.button} disabled={isSubmitting}>
            Rechercher
          </button>
        </Form>

        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <input 
                    type="checkbox" 
                    checked={bookings.length > 0 && selectedIds.size === bookings.length}
                    onChange={toggleSelectAll}
                    aria-label="Sélectionner tous les rendez-vous affichés"
                  />
                </th>
                <th>Date</th>
                <th>Statut</th>
                <th>Nom</th>
                <th>Email</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking: Booking) => (
                <tr key={booking.id}>
                  <td>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.has(booking.id)}
                      onChange={() => toggleSelect(booking.id)}
                      aria-label={`Sélectionner le rendez-vous de ${booking.names}`}
                    />
                  </td>
                  <td>{booking.local_date} {booking.local_time}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles['status-' + booking.status]}`}>
                      {booking.status}
                    </span>
                  </td>
                  <td>{booking.names}</td>
                  <td>{booking.email}</td>
                  <td>
                    <div className={styles.actions}>
                      <Form method="post" reloadDocument>
                        <input type="hidden" name="intent" value="export_booking" />
                        <input type="hidden" name="id" value={booking.id} />
                        <input type="hidden" name="csrfToken" value={csrfToken} />
                        <button type="submit" className={styles.exportButton}>
                          Exporter (JSON)
                        </button>
                      </Form>
                      <button 
                        type="button" 
                        className={styles.dangerButton}
                        onClick={(e) => setDeleteModal({ isOpen: true, id: booking.id, multiple: false, type: 'booking', triggerElement: e.currentTarget })}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={6}>Aucun rendez-vous trouvé.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedIds.size > 0 && (
          <div className={styles.bulkActions}>
            <button 
              type="button" 
              className={styles.dangerButton}
              onClick={(e) => setDeleteModal({ isOpen: true, id: null, multiple: true, type: 'booking', triggerElement: e.currentTarget })}
            >
              Supprimer les {selectedIds.size} rendez-vous sélectionnés
            </button>
          </div>
        )}
      </section>

      <section className={styles.section} style={{ marginTop: "40px" }}>
        <h2 className={styles.sectionTitle}>Recherche de galeries</h2>
        
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <input 
                    type="checkbox" 
                    checked={galleries.length > 0 && selectedGalleryIds.size === galleries.length}
                    onChange={toggleSelectAllGalleries}
                    aria-label="Sélectionner toutes les galeries affichées"
                  />
                </th>
                <th>Création</th>
                <th>Statut</th>
                <th>Mariés (Nom/Public ID)</th>
                <th>Expiration</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {galleries.map((gallery: Gallery) => (
                <tr key={gallery.id}>
                  <td>
                    <input 
                      type="checkbox" 
                      checked={selectedGalleryIds.has(gallery.id)}
                      onChange={() => toggleSelectGallery(gallery.id)}
                      aria-label={`Sélectionner la galerie de ${gallery.bride_names}`}
                    />
                  </td>
                  <td>{new Date(gallery.created_at).toLocaleDateString()}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles['status-' + gallery.status]}`}>
                      {gallery.status}
                    </span>
                  </td>
                  <td>{gallery.bride_names} ({gallery.public_id})</td>
                  <td>{new Date(gallery.expires_at).toLocaleDateString()}</td>
                  <td>
                    <div className={styles.actions}>
                      <button 
                        type="button" 
                        className={styles.dangerButton}
                        onClick={(e) => setDeleteModal({ isOpen: true, id: gallery.id, multiple: false, type: 'gallery', triggerElement: e.currentTarget })}
                      >
                        Supprimer (Quarantaine)
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {galleries.length === 0 && (
                <tr>
                  <td colSpan={6}>Aucune galerie trouvée.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedGalleryIds.size > 0 && (
          <div className={styles.bulkActions}>
            <button 
              type="button" 
              className={styles.dangerButton}
              onClick={(e) => setDeleteModal({ isOpen: true, id: null, multiple: true, type: 'gallery', triggerElement: e.currentTarget })}
            >
              Supprimer et mettre en quarantaine les {selectedGalleryIds.size} galeries sélectionnées
            </button>
          </div>
        )}
      </section>

      {/* Suppression modale */}
      {deleteModal.isOpen && (
        <div 
          className={styles.modalOverlay}
          role="dialog"
          aria-labelledby="modal-title"
          aria-modal="true"
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeDeleteModal();
          }}
        >
          <div className={styles.modal}>
            <h2 id="modal-title" className={styles.modalTitle}>Suppression définitive</h2>
            <p>
              {deleteModal.multiple 
                ? `Vous êtes sur le point de supprimer définitivement ${deleteModal.type === 'booking' ? selectedIds.size + ' rendez-vous' : selectedGalleryIds.size + ' galeries'}.` 
                : `Vous êtes sur le point de supprimer définitivement ${deleteModal.type === 'booking' ? 'le rendez-vous' : 'la galerie'} ${deleteModal.id}.`}
            </p>
            {deleteModal.type === 'gallery' && (
              <p>La galerie sera supprimée et ses médias placés en quarantaine locale technique.</p>
            )}
            <p>Cette action est <strong>irréversible</strong>.</p>
            
            <Form onSubmit={submitDelete}>
              <input 
                type="hidden" 
                name="intent" 
                value={
                  deleteModal.multiple 
                    ? (deleteModal.type === 'booking' ? "delete_booking_bulk" : "delete_gallery_bulk") 
                    : (deleteModal.type === 'booking' ? "delete_booking_single" : "delete_gallery_single")
                } 
              />
              <input type="hidden" name="csrfToken" value={csrfToken} />
              
              {!deleteModal.multiple && <input type="hidden" name="id" value={deleteModal.id ?? ""} />}
              {deleteModal.multiple && <input type="hidden" name="ids" value={JSON.stringify(Array.from(deleteModal.type === 'booking' ? selectedIds : selectedGalleryIds))} />}
              
              <div className={styles.formGroup}>
                <label htmlFor="confirmInput" className={styles.label}>
                  Veuillez taper SUPPRIMER pour confirmer :
                </label>
                <input 
                  ref={confirmInputRef}
                  id="confirmInput"
                  name="confirm"
                  type="text" 
                  required
                  className={styles.input}
                  autoComplete="off"
                />
              </div>

              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelButton} onClick={closeDeleteModal}>
                  Annuler
                </button>
                <button type="submit" className={styles.dangerButton} disabled={isSubmitting}>
                  Confirmer la suppression
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}
