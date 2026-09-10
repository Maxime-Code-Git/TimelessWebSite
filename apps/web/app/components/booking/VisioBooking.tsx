import { useState, useEffect, useRef } from "react";

export function VisioBooking({ language }: { language: 'fr' | 'en' }) {
  const [slots, setSlots] = useState<{ date: string, time: string, slot_key: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const t = {
    title: language === 'en' ? "Book a video meeting" : "Réserver un rendez-vous visio",
    unavailable: language === 'en' ? "No video meeting slots are available right now. Please use the contact form." : "Aucun créneau visio n'est disponible actuellement. N'hésitez pas à utiliser le formulaire de contact classique.",
    selectDate: language === 'en' ? "Select a date:" : "Choisissez une date :",
    selectTime: language === 'en' ? "Select a time:" : "Choisissez un horaire :",
    formTitle: language === 'en' ? "Your details" : "Vos coordonnées",
    names: language === 'en' ? "Full name *" : "Noms complets *",
    email: language === 'en' ? "Email address *" : "Adresse email *",
    phone: language === 'en' ? "Phone number" : "Numéro de téléphone",
    weddingDate: language === 'en' ? "Wedding date (if applicable)" : "Date du mariage (si applicable)",
    formula: language === 'en' ? "Interested in" : "Formule souhaitée",
    formulas: language === 'en' ? ["Photo", "Film", "Duo", "Custom", "I don't know yet"] : ["Photo", "Film", "Duo", "Sur mesure", "Je ne sais pas encore"],
    message: language === 'en' ? "Message" : "Message",
    submit: language === 'en' ? "Request appointment" : "Demander le rendez-vous",
    submitting: language === 'en' ? "Sending..." : "Envoi en cours...",
    successTitle: language === 'en' ? "Request recorded!" : "Demande enregistrée !",
    successMsg: language === 'en' ? "Your request has been saved and is pending our validation. We will send you a confirmation email with the video link shortly." : "Votre demande a bien été enregistrée et est en attente de notre validation. Nous vous enverrons très vite un email de confirmation contenant le lien visio.",
    newRequest: language === 'en' ? "Make another request" : "Faire une nouvelle demande",
    errTaken: language === 'en' ? "This slot was just booked by someone else. Please choose another one." : "Ce créneau vient juste d'être réservé par quelqu'un d'autre. Veuillez en choisir un autre.",
    errGeneric: language === 'en' ? "An error occurred. Please try again later." : "Une erreur est survenue. Veuillez réessayer plus tard."
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
    setSelectedTime(null);
  };

  const availableTimes = slots.filter(s => s.date === selectedDate).sort((a,b) => a.time.localeCompare(b.time));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.append("language", language);
    fd.append("date", selectedDate!);
    fd.append("time", selectedTime!);

    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        body: fd
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        setSlots(prev => prev.filter(s => !(s.date === selectedDate && s.time === selectedTime)));
        setSelectedDate(null);
        setSelectedTime(null);
        setTimeout(() => {
          successRef.current?.focus();
        }, 100);
      } else {
        if (data.error === "SLOT_TAKEN") {
          setError(t.errTaken);
          setSlots(prev => prev.filter(s => !(s.date === selectedDate && s.time === selectedTime)));
          setSelectedTime(null);
        } else {
          setError(t.errGeneric);
        }
      }
    } catch {
      setError(t.errGeneric);
    }
    setSubmitting(false);
  };

  if (loading) return null;

  if (success) {
    return (
      <div className="visio-booking-success" tabIndex={-1} ref={successRef}>
        <h3>{t.successTitle}</h3>
        <p>{t.successMsg}</p>
        <button className="submitBtn" onClick={() => setSuccess(false)} type="button" style={{ marginTop: '20px' }}>{t.newRequest}</button>
      </div>
    );
  }

  if (availableDates.length === 0) {
    return (
      <div className="visio-booking-empty">
        <p>{t.unavailable}</p>
      </div>
    );
  }

  return (
    <div className="visio-booking" id="visio-booking-section">
      <h2 className="title">{t.title}</h2>
      
      {error && <div className="contactFormError" role="alert">{error}</div>}

      <div className="visio-booking-steps" style={{ marginBottom: '30px' }}>
        <div className="formGroup">
          <label className="label">{t.selectDate}</label>
          <select className="input" value={selectedDate || ""} onChange={handleDateChange}>
            <option value="" disabled>-</option>
            {availableDates.map(d => (
              <option key={d} value={d}>{new Date(d).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</option>
            ))}
          </select>
        </div>

        {selectedDate && (
          <div className="formGroup" style={{ marginTop: '20px' }}>
            <label className="label">{t.selectTime}</label>
            <div className="visio-time-slots" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
              {availableTimes.map(slot => (
                <button
                  key={slot.time}
                  type="button"
                  style={{
                    padding: '10px 20px',
                    border: '1px solid var(--gold-light)',
                    background: selectedTime === slot.time ? 'var(--gold-light)' : 'transparent',
                    color: selectedTime === slot.time ? '#fff' : 'inherit',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                  onClick={() => setSelectedTime(slot.time)}
                >
                  {slot.time}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedDate && selectedTime && (
        <form onSubmit={handleSubmit} className="contactForm">
          <h3 style={{ marginBottom: '20px', fontFamily: 'var(--font-serif)', fontSize: '20px' }}>{t.formTitle}</h3>
          
          <input type="text" name="honeypot" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />

          <div className="formGroup">
            <label className="label">{t.names}</label>
            <input className="input" type="text" name="names" required maxLength={100} />
          </div>
          <div className="formGroup">
            <label className="label">{t.email}</label>
            <input className="input" type="email" name="email" required maxLength={100} />
          </div>
          <div className="formGroup">
            <label className="label">{t.phone}</label>
            <input className="input" type="tel" name="phone" maxLength={50} />
          </div>
          <div className="formGroup">
            <label className="label">{t.weddingDate}</label>
            <input className="input" type="text" name="wedding_date" maxLength={50} />
          </div>
          <div className="formGroup">
            <label className="label">{t.formula}</label>
            <select className="input" name="formula">
              <option value="">-</option>
              {t.formulas.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="formGroup">
            <label className="label">{t.message}</label>
            <textarea className="textarea" name="message" maxLength={2000}></textarea>
          </div>

          <button className="submitBtn" type="submit" disabled={submitting} style={{ marginTop: '20px' }}>
            {submitting ? t.submitting : t.submit}
          </button>
        </form>
      )}
    </div>
  );
}
