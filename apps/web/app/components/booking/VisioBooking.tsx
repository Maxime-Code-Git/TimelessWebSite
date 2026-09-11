import { useState, useEffect, useRef } from "react";
import styles from "./VisioBooking.module.css";

export function VisioBooking({ language }: { language: 'fr' | 'en' }) {
  const [slots, setSlots] = useState<{ date: string, time: string, slot_key: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const t = {
    title: language === 'en' ? "Book a video meeting" : "Réserver un rendez-vous visio",
    unavailable: language === 'en' ? "No video meeting slots are available right now. Please use the contact form." : "Aucun créneau visio n'est disponible actuellement. N'hésitez pas à utiliser le formulaire de contact classique.",
    selectDate: language === 'en' ? "Select a date:" : "Choisissez une date :",
    selectTime: language === 'en' ? "Select a time:" : "Choisissez un horaire :",
    timezone: language === 'en' ? "All times are in Brussels Time" : "Heure de Bruxelles",
    formTitle: language === 'en' ? "Your details" : "Vos coordonnées",
    names: language === 'en' ? "Full name *" : "Noms complets *",
    email: language === 'en' ? "Email address *" : "Adresse email *",
    phone: language === 'en' ? "Phone number" : "Numéro de téléphone",
    weddingDate: language === 'en' ? "Wedding date (if applicable)" : "Date du mariage (si applicable)",
    formula: language === 'en' ? "Interested in" : "Formule souhaitée",
    formulas: [
      { value: "photo", label: language === 'en' ? "Photo" : "Photo" },
      { value: "film", label: language === 'en' ? "Film" : "Film" },
      { value: "duo", label: language === 'en' ? "Duo" : "Duo" },
      { value: "custom", label: language === 'en' ? "Custom" : "Sur mesure" },
      { value: "unknown", label: language === 'en' ? "I don't know yet" : "Je ne sais pas encore" }
    ],
    message: language === 'en' ? "Message" : "Message",
    submit: language === 'en' ? "Request appointment" : "Demander le rendez-vous",
    submitting: language === 'en' ? "Sending..." : "Envoi en cours...",
    successTitle: language === 'en' ? "Request recorded!" : "Demande enregistrée !",
    successMsg: language === 'en' ? "Your request has been saved and is pending our validation. We will send you a confirmation email with the video link shortly." : "Votre demande a bien été enregistrée et est en attente de notre validation. Nous vous enverrons très vite un email de confirmation contenant le lien visio.",
    newRequest: language === 'en' ? "Make another request" : "Faire une nouvelle demande",
    errTaken: language === 'en' ? "This slot was just booked by someone else. Please choose another one." : "Ce créneau vient juste d'être réservé par quelqu'un d'autre. Veuillez en choisir un autre.",
    errGeneric: language === 'en' ? "An error occurred. Please try again later." : "Une erreur est survenue. Veuillez réessayer plus tard.",
    loading: language === 'en' ? "Loading available slots..." : "Chargement des créneaux disponibles..."
  };

  useEffect(() => {
    fetch("/api/booking")
      .then(r => r.json())
      .then(d => {
        setSlots(d.slots || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const availableDates = Array.from(new Set(slots.map(s => s.date))).sort();

  const handleDateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDate(e.target.value);
    setSelectedTime("");
  };

  const availableTimes = slots.filter(s => s.date === selectedDate).sort((a,b) => a.time.localeCompare(b.time));

  useEffect(() => {
    if (success && successRef.current) {
      successRef.current.focus();
    }
  }, [success]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const payload: Record<string, string> = {
      language,
      date: selectedDate,
      time: selectedTime,
    };

    for (const [k, v] of fd.entries()) {
      payload[k] = v.toString();
    }

    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        setSlots(prev => prev.filter(s => !(s.date === selectedDate && s.time === selectedTime)));
        setSelectedDate("");
        setSelectedTime("");
      } else {
        if (data.error === "SLOT_TAKEN") {
          setError(t.errTaken);
          setSlots(prev => prev.filter(s => !(s.date === selectedDate && s.time === selectedTime)));
          setSelectedTime("");
        } else {
          setError(t.errGeneric);
        }
      }
    } catch {
      setError(t.errGeneric);
    }
    setSubmitting(false);
  };

  if (loading) {
    return <div className={styles.loading} aria-live="polite">{t.loading}</div>;
  }

  if (success) {
    return (
      <div className={styles.successContainer} tabIndex={-1} ref={successRef}>
        <h3>{t.successTitle}</h3>
        <p>{t.successMsg}</p>
        <button className={styles.submitBtn} onClick={() => setSuccess(false)} type="button">{t.newRequest}</button>
      </div>
    );
  }

  if (availableDates.length === 0) {
    return (
      <div className={styles.emptyContainer}>
        <p>{t.unavailable}</p>
      </div>
    );
  }

  return (
    <div className={styles.container} id="visio-booking-section">
      <h2 className={styles.title}>{t.title}</h2>
      <p className={styles.timezone}>{t.timezone}</p>

      {error && <div className={styles.errorMsg} role="alert">{error}</div>}

      <div className={styles.formGrid}>
        <div>
          <label htmlFor="visio-date" className={styles.label}>{t.selectDate}</label>
          <select id="visio-date" name="date" className={styles.select} value={selectedDate} onChange={handleDateChange}>
            <option value="" disabled>-</option>
            {availableDates.map(d => (
              <option key={d} value={d}>{new Date(d).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</option>
            ))}
          </select>
        </div>

        {selectedDate && (
          <div>
            <label htmlFor="visio-time" className={styles.label}>{t.selectTime}</label>
            <select id="visio-time" name="time" className={styles.select} value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)}>
              <option value="" disabled>-</option>
              {availableTimes.map(slot => (
                <option key={slot.time} value={slot.time}>{slot.time}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {selectedDate && selectedTime && (
        <form onSubmit={handleSubmit} className={styles.formSection}>
          <h3 className={styles.formSectionTitle}>{t.formTitle}</h3>

          <input type="text" name="honeypot" className={styles.honeypot} tabIndex={-1} autoComplete="off" />

          <div className={styles.formGrid}>
            <div className={styles.fullWidth}>
              <label htmlFor="visio-names" className={styles.label}>{t.names}</label>
              <input id="visio-names" className={styles.input} type="text" name="names" required maxLength={100} />
            </div>

            <div className={styles.fullWidth}>
              <label htmlFor="visio-email" className={styles.label}>{t.email}</label>
              <input id="visio-email" className={styles.input} type="email" name="email" required maxLength={100} />
            </div>

            <div>
              <label htmlFor="visio-phone" className={styles.label}>{t.phone}</label>
              <input id="visio-phone" className={styles.input} type="tel" name="phone" maxLength={50} />
            </div>

            <div>
              <label htmlFor="visio-wedding" className={styles.label}>{t.weddingDate}</label>
              <input id="visio-wedding" className={styles.input} type="text" name="wedding_date" maxLength={50} />
            </div>

            <div className={styles.fullWidth}>
              <label htmlFor="visio-formula" className={styles.label}>{t.formula}</label>
              <select id="visio-formula" className={styles.select} name="formula">
                <option value="">-</option>
                {t.formulas.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>

            <div className={styles.fullWidth}>
              <label htmlFor="visio-message" className={styles.label}>{t.message}</label>
              <textarea id="visio-message" className={styles.textarea} name="message" maxLength={2000}></textarea>
            </div>
          </div>

          <div className={styles.submitWrapper}>
            <button className={styles.submitBtn} type="submit" disabled={submitting}>
              {submitting ? t.submitting : t.submit}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
