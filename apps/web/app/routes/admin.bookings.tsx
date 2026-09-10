import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { data, Form, Link, useLoaderData, useNavigation, useSubmit } from "react-router";
import { requireValidAdminSession, validateAdminFormData, ActionSecurityError } from "../lib/admin-auth.server";
import { 
  getAllBookings, getWeeklySlots, getBlockedDates, updateBookingStatus,
  toggleWeeklySlot, addBlockedDate, removeBlockedDate, isValidVisioUrl, getBooking
} from "../lib/booking.server";
import { sendBookingConfirmedEmail, sendBookingStatusEmail } from "../lib/mailer.server";
import styles from "./admin.module.css";
import * as crypto from "node:crypto";
import { commitSession } from "../lib/session.server";
import { useState } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireValidAdminSession(request);

  let csrfToken = session.get("csrfToken");
  const headers = new Headers();
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    session.set("csrfToken", csrfToken);
    headers.set("Set-Cookie", await commitSession(session));
  }
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");

  const bookings = getAllBookings();
  const weeklySlots = getWeeklySlots();
  const blockedDates = getBlockedDates();

  return data({
    bookings,
    weeklySlots,
    blockedDates,
    csrfToken
  }, { headers });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireValidAdminSession(request);
  
  let formData: FormData;
  try {
    formData = await validateAdminFormData(request);
  } catch (err) {
    if (err instanceof ActionSecurityError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const intent = formData.get("intent");
  
  try {
    if (intent === "confirm_booking") {
      const id = String(formData.get("id"));
      const meetingUrl = String(formData.get("meeting_url"));
      const adminNote = formData.get("admin_note") ? String(formData.get("admin_note")) : undefined;
      
      if (!isValidVisioUrl(meetingUrl)) {
        return Response.json({ error: "Invalid meeting URL. Must be HTTPS and from Google Meet, Zoom, or Teams." }, { status: 400 });
      }
      
      const booking = updateBookingStatus(id, "confirmed", meetingUrl, adminNote);
      await sendBookingConfirmedEmail(booking);
      return Response.json({ success: true });
    }
    
    if (intent === "reject_booking" || intent === "cancel_booking") {
      const id = String(formData.get("id"));
      const status = intent === "reject_booking" ? "rejected" : "cancelled";
      const adminNote = formData.get("admin_note") ? String(formData.get("admin_note")) : undefined;
      
      const oldBooking = getBooking(id);
      if (!oldBooking) return Response.json({ error: "Not found" }, { status: 404 });
      
      const booking = updateBookingStatus(id, status, undefined, adminNote);
      await sendBookingStatusEmail(booking, status);
      return Response.json({ success: true });
    }
    
    if (intent === "toggle_weekly_slot") {
      const id = String(formData.get("id"));
      toggleWeeklySlot(id);
      return Response.json({ success: true });
    }
    
    if (intent === "add_blocked_date") {
      const date = String(formData.get("date"));
      const reason = formData.get("reason") ? String(formData.get("reason")) : undefined;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return Response.json({ error: "Invalid date format" }, { status: 400 });
      }
      addBlockedDate(date, reason);
      return Response.json({ success: true });
    }
    
    if (intent === "remove_blocked_date") {
      const id = String(formData.get("id"));
      removeBlockedDate(id);
      return Response.json({ success: true });
    }
    
    return Response.json({ error: "Unknown intent" }, { status: 400 });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Action failed" }, { status: 500 });
  }
}

export default function AdminBookings() {
  const { bookings, weeklySlots, blockedDates, csrfToken } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSubmitting = navigation.state !== "idle";

  const [activeTab, setActiveTab] = useState<'pending' | 'confirmed' | 'past_rejected' | 'settings'>('pending');

  const pendingBookings = bookings.filter(b => b.status === 'pending');
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
  const pastBookings = bookings.filter(b => b.status === 'rejected' || b.status === 'cancelled');

  const [confirmModalData, setConfirmModalData] = useState<{id: string} | null>(null);
  const [rejectModalData, setRejectModalData] = useState<{id: string, action: 'reject'|'cancel'} | null>(null);

  const confirmSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submit(e.currentTarget);
    setConfirmModalData(null);
    setRejectModalData(null);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <Link to="/admin" className={styles.backLink}>&larr; Retour</Link>
          <h1 className={styles.headerTitle}>Rendez-vous visio</h1>
        </div>
      </header>

      <main className={styles.mainContent}>
        <div className={styles.dashboardCard} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button onClick={() => setActiveTab('pending')} style={{ fontWeight: activeTab === 'pending' ? 'bold' : 'normal' }}>En attente ({pendingBookings.length})</button>
          <button onClick={() => setActiveTab('confirmed')} style={{ fontWeight: activeTab === 'confirmed' ? 'bold' : 'normal' }}>Confirmés ({confirmedBookings.length})</button>
          <button onClick={() => setActiveTab('past_rejected')} style={{ fontWeight: activeTab === 'past_rejected' ? 'bold' : 'normal' }}>Historique ({pastBookings.length})</button>
          <button onClick={() => setActiveTab('settings')} style={{ fontWeight: activeTab === 'settings' ? 'bold' : 'normal' }}>Paramètres & Dates bloquées</button>
        </div>

        {activeTab === 'pending' && (
          <div className={styles.dashboardCard}>
            <h2>Demandes en attente</h2>
            {pendingBookings.length === 0 && <p>Aucune demande en attente.</p>}
            {pendingBookings.map(b => (
              <div key={b.id} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px', borderRadius: '5px' }}>
                <p><strong>{b.local_date} {b.local_time}</strong> - {b.names} ({b.email})</p>
                <p>Formule: {b.formula} | Langue: {b.language} | Mariage: {b.wedding_date}</p>
                <p>Message: {b.message}</p>
                <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                  <button onClick={() => setConfirmModalData({ id: b.id })} className={styles.submitButton}>Accepter & Ajouter lien visio</button>
                  <button onClick={() => setRejectModalData({ id: b.id, action: 'reject' })} className={styles.logoutButton}>Refuser</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'confirmed' && (
          <div className={styles.dashboardCard}>
            <h2>Rendez-vous confirmés</h2>
            {confirmedBookings.length === 0 && <p>Aucun rendez-vous confirmé à venir.</p>}
            {confirmedBookings.map(b => (
              <div key={b.id} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px', borderRadius: '5px' }}>
                <p><strong>{b.local_date} {b.local_time}</strong> - {b.names} ({b.email})</p>
                <p>Lien: <a href={b.meeting_url || ''} target="_blank" rel="noreferrer">{b.meeting_url}</a></p>
                <button onClick={() => setRejectModalData({ id: b.id, action: 'cancel' })} className={styles.logoutButton} style={{ marginTop: '10px' }}>Annuler le rendez-vous</button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'past_rejected' && (
          <div className={styles.dashboardCard}>
            <h2>Historique</h2>
            {pastBookings.length === 0 && <p>Aucun historique.</p>}
            {pastBookings.map(b => (
              <div key={b.id} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px', borderRadius: '5px' }}>
                <p><strong>{b.local_date} {b.local_time}</strong> - {b.names} ({b.status})</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className={styles.dashboardCard}>
              <h2>Horaires récurrents</h2>
              <ul>
                {weeklySlots.map(s => {
                  const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
                  return (
                    <li key={s.id} style={{ marginBottom: '10px' }}>
                      {dayNames[s.weekday - 1]} {s.local_time} - {s.active ? 'Actif' : 'Désactivé'}
                      <Form method="post" style={{ display: 'inline-block', marginLeft: '10px' }}>
                        <input type="hidden" name="csrfToken" value={csrfToken} />
                        <input type="hidden" name="intent" value="toggle_weekly_slot" />
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" disabled={isSubmitting}>{s.active ? 'Désactiver' : 'Activer'}</button>
                      </Form>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className={styles.dashboardCard}>
              <h2>Dates bloquées exceptionnelles</h2>
              <Form method="post" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input type="hidden" name="csrfToken" value={csrfToken} />
                <input type="hidden" name="intent" value="add_blocked_date" />
                <input type="date" name="date" required className={styles.input} />
                <input type="text" name="reason" placeholder="Raison (optionnel)" className={styles.input} />
                <button type="submit" disabled={isSubmitting} className={styles.submitButton}>Bloquer la date</button>
              </Form>

              <ul>
                {blockedDates.map(bd => (
                  <li key={bd.id} style={{ marginBottom: '10px' }}>
                    {bd.local_date} {bd.reason ? `(${bd.reason})` : ''}
                    <Form method="post" style={{ display: 'inline-block', marginLeft: '10px' }}>
                      <input type="hidden" name="csrfToken" value={csrfToken} />
                      <input type="hidden" name="intent" value="remove_blocked_date" />
                      <input type="hidden" name="id" value={bd.id} />
                      <button type="submit" disabled={isSubmitting}>Supprimer</button>
                    </Form>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

      </main>

      {/* Confirmation Modal */}
      {confirmModalData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className={styles.dashboardCard} style={{ width: '500px', background: '#1c1c1c' }}>
            <h3>Confirmer le rendez-vous</h3>
            <Form method="post" onSubmit={confirmSubmit}>
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="intent" value="confirm_booking" />
              <input type="hidden" name="id" value={confirmModalData.id} />
              
              <label className={styles.label}>Lien visio (Google Meet, Zoom, Teams)</label>
              <input type="url" name="meeting_url" required className={styles.input} style={{ marginBottom: '10px' }} />

              <label className={styles.label}>Note (optionnel - sera envoyée au client)</label>
              <textarea name="admin_note" className={styles.input} style={{ marginBottom: '20px' }}></textarea>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setConfirmModalData(null)} className={styles.logoutButton}>Annuler</button>
                <button type="submit" className={styles.submitButton}>Envoyer la confirmation</button>
              </div>
            </Form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className={styles.dashboardCard} style={{ width: '500px', background: '#1c1c1c' }}>
            <h3>{rejectModalData.action === 'reject' ? 'Refuser la demande' : 'Annuler le rendez-vous'}</h3>
            <Form method="post" onSubmit={confirmSubmit}>
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="intent" value={rejectModalData.action === 'reject' ? "reject_booking" : "cancel_booking"} />
              <input type="hidden" name="id" value={rejectModalData.id} />

              <label className={styles.label}>Motif (optionnel - sera envoyé au client)</label>
              <textarea name="admin_note" className={styles.input} style={{ marginBottom: '20px' }}></textarea>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setRejectModalData(null)} className={styles.submitButton}>Fermer</button>
                <button type="submit" className={styles.logoutButton}>Confirmer l'action</button>
              </div>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}
