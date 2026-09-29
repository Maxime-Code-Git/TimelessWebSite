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
import { requireAdminSession, constantTimeEqual } from "../lib/auth.server";
import { createAdminHeaders } from "../lib/admin-auth.server";
import { validateOrigin } from "../lib/security.server";
import { getBookingDb } from "../lib/db-booking.server";
import {
  getGalleryDb,
  deleteGalleryAndQuarantine
} from "../lib/gallery-db.server";
import {
  processGalleryDeletions,
  retryFailedJob
} from "../lib/gallery-deletion-worker.server";
import styles from "./admin.data-retention.module.css";
import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────

interface Booking {
  id: string;
  names: string;
  email: string;
  local_date: string;
  local_time: string;
  status: string;
  starts_at_utc: string;
}

interface Gallery {
  id: string;
  public_id: string;
  bride_names: string;
  wedding_date: string;
  status: string;
  expires_at: number;
  created_at: number;
  photo_count: number;
  video_count: number;
  total_size: number;
}

interface DeletionJobSummary {
  pending: number;
  processing: number;
  failed: number;
  failedJobs: { id: string; gallery_id: string; error_message: string | null }[];
}

interface LoaderData {
  bookings: Booking[];
  galleries: Gallery[];
  csrfToken: string;
  q: string;
  deletionJobs: DeletionJobSummary;
}

// ── Constants ────────────────────────────────────────────────

const MAX_BODY_SIZE = 131072; // 128 KB
const MAX_BULK_IDS = 50;
const VALID_INTENTS = [
  "export_booking",
  "delete_booking_single",
  "delete_booking_bulk",
  "delete_gallery_single",
  "delete_gallery_bulk",
  "retry_failed_job"
] as const;
type Intent = typeof VALID_INTENTS[number];

const BOOKING_EXPORT_COLUMNS = [
  "id", "local_date", "local_time", "starts_at_utc", "ends_at_utc",
  "timezone", "status", "names", "email", "phone", "wedding_date",
  "formula", "message", "language", "created_at", "updated_at"
] as const;

// ── Helpers ──────────────────────────────────────────────────

function secureHeaders(): Headers {
  const headers = createAdminHeaders();
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return headers;
}

function errorResponse(msg: string, status: number): Response {
  return Response.json({ error: msg }, { status, headers: secureHeaders() });
}

function isValidId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 128 && /^[0-9a-zA-Z_-]+$/.test(id);
}

// ── Meta ─────────────────────────────────────────────────────

export function meta() {
  return [
    { title: "Conservation et suppression des données - Administration" },
    { name: "robots", content: "noindex, nofollow" }
  ];
}

// ── Loader ───────────────────────────────────────────────────

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

  const bookings = db.prepare(query).all(...params) as unknown as Booking[];

  const galleryDb = getGalleryDb();
  let gQuery = `SELECT g.id, g.public_id, g.bride_names, g.wedding_date, g.status, g.expires_at, g.created_at,
    COALESCE(SUM(CASE WHEN m.type = 'photo' THEN 1 ELSE 0 END), 0) as photo_count,
    COALESCE(SUM(CASE WHEN m.type = 'video' THEN 1 ELSE 0 END), 0) as video_count,
    COALESCE(SUM(m.size), 0) as total_size
    FROM galleries g
    LEFT JOIN gallery_media m ON m.gallery_id = g.id`;
  const gParams: string[] = [];

  if (q) {
    gQuery += " WHERE g.public_id LIKE ? OR g.bride_names LIKE ? OR g.id = ? OR g.status = ?";
    gParams.push(`%${q}%`, `%${q}%`, q, q);
  }
  gQuery += " GROUP BY g.id ORDER BY g.created_at DESC LIMIT 100";

  const galleries = galleryDb.prepare(gQuery).all(...gParams) as unknown as Gallery[];

  // Deletion job stats
  const jobStats = galleryDb.prepare(
    `SELECT status, COUNT(*) as cnt FROM gallery_deletion_jobs WHERE status IN ('pending','processing','failed') GROUP BY status`
  ).all() as { status: string; cnt: number }[];

  const jobSummary: DeletionJobSummary = { pending: 0, processing: 0, failed: 0, failedJobs: [] };
  for (const row of jobStats) {
    if (row.status === "pending") jobSummary.pending = row.cnt;
    else if (row.status === "processing") jobSummary.processing = row.cnt;
    else if (row.status === "failed") jobSummary.failed = row.cnt;
  }

  if (jobSummary.failed > 0) {
    jobSummary.failedJobs = galleryDb.prepare(
      `SELECT id, gallery_id, error_message FROM gallery_deletion_jobs WHERE status = 'failed' LIMIT 20`
    ).all() as { id: string; gallery_id: string; error_message: string | null }[];
  }

  const csrfToken = session.get("csrfToken") ?? "";

  return Response.json(
    { bookings, galleries, csrfToken, q, deletionJobs: jobSummary },
    { headers: secureHeaders() }
  );
}

// ── Action ───────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: secureHeaders() });
  }

  if (!validateOrigin(request)) {
    return errorResponse("Forbidden", 403);
  }

  // Content-Type validation
  const rawContentType = request.headers.get("content-type") || "";
  const mimeType = rawContentType.split(";")[0]?.trim().toLowerCase();
  if (mimeType !== "application/x-www-form-urlencoded" && mimeType !== "multipart/form-data") {
    return new Response("Unsupported Media Type", { status: 415, headers: secureHeaders() });
  }

  // Content-Length validation
  const clHeader = request.headers.get("content-length");
  if (clHeader !== null) {
    if (!/^\d+$/.test(clHeader)) {
      return errorResponse("Invalid Content-Length", 400);
    }
    const cl = Number(clHeader);
    if (!Number.isInteger(cl) || cl < 0 || cl > MAX_BODY_SIZE) {
      return errorResponse("Payload Too Large", 413);
    }
  }

  // Session validation
  const { isValid, session } = await requireAdminSession(request);
  if (!isValid) {
    return new Response("Unauthorized", { status: 401, headers: secureHeaders() });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("Bad Request", 400);
  }

  // CSRF
  const formCsrf = String(formData.get("csrfToken") ?? "");
  const sessionCsrf = session.get("csrfToken") ?? "";
  if (!formCsrf || !sessionCsrf || !constantTimeEqual(formCsrf, sessionCsrf)) {
    return errorResponse("Invalid CSRF token", 403);
  }

  // Intent validation (closed list)
  const intent = String(formData.get("intent") ?? "");
  if (!VALID_INTENTS.includes(intent as Intent)) {
    return errorResponse("Unknown intent", 400);
  }

  const db = getBookingDb();

  // ── Export booking ──────────────────────────────────────
  if (intent === "export_booking") {
    const id = String(formData.get("id") ?? "");
    if (!isValidId(id)) return errorResponse("Invalid booking ID", 400);

    const columnList = BOOKING_EXPORT_COLUMNS.join(", ");
    const booking = db.prepare(`SELECT ${columnList} FROM bookings WHERE id = ?`).get(id);
    if (!booking) {
      return new Response("Not found", { status: 404, headers: secureHeaders() });
    }
    const json = JSON.stringify(booking, null, 2);
    const h = secureHeaders();
    h.set("Content-Type", "application/json");
    h.set("Content-Disposition", `attachment; filename="booking_export.json"`);
    return new Response(json, { headers: h });
  }

  // ── Delete booking single ──────────────────────────────
  if (intent === "delete_booking_single") {
    const id = String(formData.get("id") ?? "");
    if (!isValidId(id)) return errorResponse("Invalid booking ID", 400);
    const confirm = String(formData.get("confirm") ?? "");
    if (confirm !== "SUPPRIMER") {
      return errorResponse("Confirmation incorrecte", 400);
    }

    // Check booking exists and is deletable
    const booking = db.prepare(
      "SELECT id, status, starts_at_utc FROM bookings WHERE id = ?"
    ).get(id) as { id: string; status: string; starts_at_utc: string } | undefined;
    if (!booking) {
      return new Response("Not found", { status: 404, headers: secureHeaders() });
    }

    if (
      (booking.status === "confirmed" || booking.status === "pending") &&
      new Date(booking.starts_at_utc) > new Date()
    ) {
      return errorResponse("Impossible de supprimer un rendez-vous futur confirmé", 400);
    }

    db.exec("BEGIN EXCLUSIVE TRANSACTION;");
    try {
      db.prepare("DELETE FROM bookings WHERE id = ?").run(id);
      db.exec("COMMIT;");
      return Response.json(
        { success: true, message: "Rendez-vous supprimé définitivement.", deletedCount: 1 },
        { headers: secureHeaders() }
      );
    } catch {
      db.exec("ROLLBACK;");
      return errorResponse("Erreur lors de la suppression", 500);
    }
  }

  // ── Delete booking bulk ────────────────────────────────
  if (intent === "delete_booking_bulk") {
    const confirm = String(formData.get("confirm") ?? "");
    if (confirm !== "SUPPRIMER") {
      return errorResponse("Confirmation incorrecte", 400);
    }

    const idsStr = String(formData.get("ids") ?? "");
    let ids: unknown;
    try {
      ids = JSON.parse(idsStr);
    } catch {
      return errorResponse("Format invalide", 400);
    }
    if (!Array.isArray(ids)) return errorResponse("Format invalide", 400);
    if (ids.length === 0) return errorResponse("Aucun rendez-vous sélectionné", 400);
    if (ids.length > MAX_BULK_IDS) return errorResponse("Trop d'éléments sélectionnés", 400);
    if (!ids.every((v): v is string => typeof v === "string" && isValidId(v))) {
      return errorResponse("Identifiants invalides", 400);
    }
    // Deduplicate
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) {
      return errorResponse("Identifiants dupliqués", 400);
    }

    // Verify all exist
    const now = new Date();
    for (const id of uniqueIds) {
      const booking = db.prepare(
        "SELECT id, status, starts_at_utc FROM bookings WHERE id = ?"
      ).get(id) as { id: string; status: string; starts_at_utc: string } | undefined;
      if (!booking) {
        return errorResponse(`Rendez-vous introuvable : ${id}`, 404);
      }
      if (
        (booking.status === "confirmed" || booking.status === "pending") &&
        new Date(booking.starts_at_utc) > now
      ) {
        return errorResponse(`Impossible de supprimer le rendez-vous futur ${id}`, 400);
      }
    }

    db.exec("BEGIN EXCLUSIVE TRANSACTION;");
    try {
      let deletedCount = 0;
      for (const id of uniqueIds) {
        const info = db.prepare("DELETE FROM bookings WHERE id = ?").run(id);
        deletedCount += Number(info.changes);
      }
      db.exec("COMMIT;");
      return Response.json(
        { success: true, message: `${deletedCount} rendez-vous supprimés définitivement.`, deletedCount },
        { headers: secureHeaders() }
      );
    } catch {
      db.exec("ROLLBACK;");
      return errorResponse("Erreur lors de la suppression groupée", 500);
    }
  }

  // ── Delete gallery single ──────────────────────────────
  if (intent === "delete_gallery_single") {
    const id = String(formData.get("id") ?? "");
    if (!isValidId(id)) return errorResponse("Invalid gallery ID", 400);
    const confirm = String(formData.get("confirm") ?? "");
    if (confirm !== "SUPPRIMER") return errorResponse("Confirmation incorrecte", 400);

    try {
      deleteGalleryAndQuarantine(id);
      return Response.json(
        { success: true, message: "Galerie supprimée et mise en quarantaine." },
        { headers: secureHeaders() }
      );
    } catch {
      return errorResponse("Erreur lors de la suppression de la galerie", 500);
    }
  }

  // ── Delete gallery bulk ────────────────────────────────
  if (intent === "delete_gallery_bulk") {
    const confirm = String(formData.get("confirm") ?? "");
    if (confirm !== "SUPPRIMER") return errorResponse("Confirmation incorrecte", 400);

    const idsStr = String(formData.get("ids") ?? "");
    let ids: unknown;
    try {
      ids = JSON.parse(idsStr);
    } catch {
      return errorResponse("Format invalide", 400);
    }
    if (!Array.isArray(ids)) return errorResponse("Format invalide", 400);
    if (ids.length === 0) return errorResponse("Aucune galerie sélectionnée", 400);
    if (ids.length > MAX_BULK_IDS) return errorResponse("Trop d'éléments sélectionnés", 400);
    if (!ids.every((v): v is string => typeof v === "string" && isValidId(v))) {
      return errorResponse("Identifiants invalides", 400);
    }
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) {
      return errorResponse("Identifiants dupliqués", 400);
    }

    // Verify all exist
    const galleryDb = getGalleryDb();
    for (const id of uniqueIds) {
      const g = galleryDb.prepare("SELECT id FROM galleries WHERE id = ?").get(id);
      if (!g) return errorResponse(`Galerie introuvable : ${id}`, 404);
    }

    let successCount = 0;
    for (const id of uniqueIds) {
      deleteGalleryAndQuarantine(id);
      successCount++;
    }
    return Response.json(
      { success: true, message: `${successCount} galeries supprimées et mises en quarantaine.`, deletedCount: successCount },
      { headers: secureHeaders() }
    );
  }

  // ── Retry failed job ───────────────────────────────────
  if (intent === "retry_failed_job") {
    const jobId = String(formData.get("jobId") ?? "");
    if (!jobId || !/^[0-9a-f-]+$/i.test(jobId)) {
      return errorResponse("Invalid job ID", 400);
    }
    try {
      retryFailedJob(jobId);
      processGalleryDeletions();
      return Response.json(
        { success: true, message: "Job relancé avec succès." },
        { headers: secureHeaders() }
      );
    } catch {
      return errorResponse("Impossible de relancer ce job", 400);
    }
  }

  return errorResponse("Unknown intent", 400);
}

// ── Component ────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

export default function DataRetentionPage() {
  const { bookings, galleries, csrfToken, q, deletionJobs } = useLoaderData<LoaderData>();
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
    type: "booking" | "gallery";
    triggerElement: HTMLElement | null;
  }>({
    isOpen: false,
    id: null,
    multiple: false,
    type: "booking",
    triggerElement: null
  });

  const confirmInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (deleteModal.isOpen && confirmInputRef.current) {
      confirmInputRef.current.focus();
    }
  }, [deleteModal.isOpen]);

  // Focus trap
  useEffect(() => {
    if (!deleteModal.isOpen || !modalRef.current) return;
    const modal = modalRef.current;
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    modal.addEventListener("keydown", handleTab);
    return () => modal.removeEventListener("keydown", handleTab);
  }, [deleteModal.isOpen]);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === bookings.length && bookings.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(bookings.map((b) => b.id)));
    }
  }, [bookings, selectedIds.size]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const toggleSelectAllGalleries = useCallback(() => {
    if (selectedGalleryIds.size === galleries.length && galleries.length > 0) {
      setSelectedGalleryIds(new Set());
    } else {
      setSelectedGalleryIds(new Set(galleries.map((g) => g.id)));
    }
  }, [galleries, selectedGalleryIds.size]);

  const toggleSelectGallery = useCallback((id: string) => {
    setSelectedGalleryIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const closeDeleteModal = useCallback(() => {
    const trigger = deleteModal.triggerElement;
    setDeleteModal({ isOpen: false, id: null, multiple: false, type: "booking", triggerElement: null });
    if (trigger) {
      requestAnimationFrame(() => trigger.focus());
    }
  }, [deleteModal.triggerElement]);

  const submitDelete = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    submit(formData, { method: "post" });
    closeDeleteModal();
  }, [submit, closeDeleteModal]);

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
          <li>Aucune suppression automatique n&apos;est active pour le moment.</li>
          <li>Les durées de conservation doivent correspondre à la politique de confidentialité publiée.</li>
          <li>Les e-mails de contact sont stockés dans la messagerie et ne peuvent pas être supprimés d&apos;ici.</li>
          <li>Les sauvegardes ont leur propre durée de conservation.</li>
          <li>La suppression d&apos;une galerie ne supprime jamais le dossier source d&apos;import.</li>
          <li>Une suppression définitive est irréversible (après nettoyage de la quarantaine pour les galeries).</li>
        </ul>
      </div>

      {/* Cleanup status */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Statut du nettoyage</h2>
        <div className={styles.jobStats}>
          <span className={styles.jobStat}>En attente : {deletionJobs.pending}</span>
          <span className={styles.jobStat}>En cours : {deletionJobs.processing}</span>
          <span className={styles.jobStat}>Échoués : {deletionJobs.failed}</span>
        </div>
        {deletionJobs.failedJobs.length > 0 && (
          <div className={styles.failedJobsList}>
            <h3>Jobs échoués</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID du job</th>
                  <th>Galerie</th>
                  <th>Erreur</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {deletionJobs.failedJobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.id.slice(0, 8)}</td>
                    <td>{job.gallery_id}</td>
                    <td>{job.error_message ?? "Inconnue"}</td>
                    <td>
                      <Form method="post">
                        <input type="hidden" name="intent" value="retry_failed_job" />
                        <input type="hidden" name="csrfToken" value={csrfToken} />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button type="submit" className={styles.retryButton} disabled={isSubmitting}>
                          Relancer
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Bookings search */}
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
              {bookings.map((booking) => (
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
                    <span className={`${styles.statusBadge} ${styles["status-" + booking.status] || ""}`}>
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
                        onClick={(e) => setDeleteModal({ isOpen: true, id: booking.id, multiple: false, type: "booking", triggerElement: e.currentTarget })}
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
              onClick={(e) => setDeleteModal({ isOpen: true, id: null, multiple: true, type: "booking", triggerElement: e.currentTarget })}
            >
              Supprimer les {selectedIds.size} rendez-vous sélectionnés
            </button>
          </div>
        )}
      </section>

      {/* Galleries */}
      <section className={styles.galleriesSection}>
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
                <th>Photos</th>
                <th>Vidéos</th>
                <th>Taille</th>
                <th>Expiration</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {galleries.map((gallery) => (
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
                    <span className={`${styles.statusBadge} ${styles["status-" + gallery.status] || ""}`}>
                      {gallery.status}
                    </span>
                  </td>
                  <td>{gallery.bride_names} ({gallery.public_id})</td>
                  <td>{gallery.photo_count}</td>
                  <td>{gallery.video_count}</td>
                  <td>{formatSize(gallery.total_size)}</td>
                  <td>{new Date(gallery.expires_at).toLocaleDateString()}</td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={(e) => setDeleteModal({ isOpen: true, id: gallery.id, multiple: false, type: "gallery", triggerElement: e.currentTarget })}
                      >
                        Supprimer (Quarantaine)
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {galleries.length === 0 && (
                <tr>
                  <td colSpan={9}>Aucune galerie trouvée.</td>
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
              onClick={(e) => setDeleteModal({ isOpen: true, id: null, multiple: true, type: "gallery", triggerElement: e.currentTarget })}
            >
              Supprimer et mettre en quarantaine les {selectedGalleryIds.size} galeries sélectionnées
            </button>
          </div>
        )}
      </section>

      {/* Deletion modal */}
      {deleteModal.isOpen && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-labelledby="modal-title"
          aria-modal="true"
          ref={modalRef}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeDeleteModal();
          }}
        >
          <div className={styles.modal}>
            <h2 id="modal-title" className={styles.modalTitle}>Suppression définitive</h2>
            <p>
              {deleteModal.multiple
                ? `Vous êtes sur le point de supprimer définitivement ${deleteModal.type === "booking" ? selectedIds.size + " rendez-vous" : selectedGalleryIds.size + " galeries"}.`
                : `Vous êtes sur le point de supprimer définitivement ${deleteModal.type === "booking" ? "le rendez-vous" : "la galerie"} ${deleteModal.id}.`}
            </p>
            {deleteModal.type === "gallery" && (
              <p>La galerie sera supprimée et ses médias placés en quarantaine locale technique.</p>
            )}
            <p>Cette action est <strong>irréversible</strong>.</p>

            <Form onSubmit={submitDelete}>
              <input
                type="hidden"
                name="intent"
                value={
                  deleteModal.multiple
                    ? (deleteModal.type === "booking" ? "delete_booking_bulk" : "delete_gallery_bulk")
                    : (deleteModal.type === "booking" ? "delete_booking_single" : "delete_gallery_single")
                }
              />
              <input type="hidden" name="csrfToken" value={csrfToken} />

              {!deleteModal.multiple && <input type="hidden" name="id" value={deleteModal.id ?? ""} />}
              {deleteModal.multiple && <input type="hidden" name="ids" value={JSON.stringify(Array.from(deleteModal.type === "booking" ? selectedIds : selectedGalleryIds))} />}

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
