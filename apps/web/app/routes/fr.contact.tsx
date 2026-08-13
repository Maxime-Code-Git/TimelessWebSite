import type { Route } from "./+types/fr.contact";
import { useState } from "react";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./contact.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Contact — Timeless" },
    { name: "description", content: "Écrivez-nous, sans engagement — nous prendrons le temps de vous répondre." },
    { tagName: "link", rel: "canonical", href: "https://timeless.be/fr/contact" },
    { tagName: "link", rel: "alternate", hrefLang: "fr", href: "https://timeless.be/fr/contact" },
    { tagName: "link", rel: "alternate", hrefLang: "en", href: "https://timeless.be/en/contact" },
  ];
}

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const WEEKDAYS = ['Lu','Ma','Me','Je','Ve','Sa','Di'];
const SLOTS = ['10:00 – 10:30','10:30 – 11:00','11:00 – 11:30','11:30 – 12:00','14:00 – 14:30','14:30 – 15:00','15:00 – 15:30','15:30 – 16:00'];

export default function ContactFr() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selDay, setSelDay] = useState<number | null>(null);
  const [selSlot, setSelSlot] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<'idle' | 'error' | 'dev_mock'>('idle');

  const shiftMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setMonth(m);
    setYear(y);
    setSelDay(null);
    setSelSlot(null);
  };

  const buildCalendar = () => {
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const total = new Date(year, month + 1, 0).getDate();
    const cells = [];
    
    for (let i = 0; i < offset; i++) {
      cells.push({ label: '', disabled: true, type: 'hidden' });
    }
    for (let d = 1; d <= total; d++) {
      const dow = new Date(year, month, d).getDay();
      const open = dow === 2 || dow === 4; // Tuesdays and Thursdays
      const selected = selDay === d;
      let type = 'disabled';
      if (selected) type = 'selected';
      else if (open) type = 'available';

      cells.push({
        label: String(d),
        disabled: !open,
        type,
        day: d
      });
    }
    return cells;
  };

  const cells = buildCalendar();

  let recap = 'aucun créneau sélectionné';
  if (selDay && selSlot) recap = `${selDay} ${MONTHS[month].toLowerCase()} ${year} à ${selSlot}`;
  else if (selDay) recap = `${selDay} ${MONTHS[month].toLowerCase()} ${year} — choisissez une heure`;
  
  const ready = Boolean(selDay && selSlot);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (import.meta.env.DEV) {
      setFormStatus('dev_mock');
    } else {
      setFormStatus('error');
    }
  };

  return (
    <div className={styles.container}>
      <Header lang="fr" alternateLangHref="/en/contact" />

      <main>
        {/* ── Hero ────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.heroDivider}></div>
          <h1 className={styles.heroTitle}>Racontons votre jour.</h1>
          <p className={styles.heroText}>Écrivez-nous, sans engagement — nous prendrons le temps de vous répondre.</p>
        </section>

        {/* ── Discovery Call Promo ────────────────────────── */}
        <section className={styles.callPromo}>
          <h2 className={styles.callPromoTitle}>Envie de nous parler de vive voix ?</h2>
          <p className={styles.callPromoText}>Un appel découverte gratuit, sans engagement, pour faire connaissance et parler de votre mariage.</p>
          <div className={styles.callPromoTags}>
            <span className={styles.callPromoTag}>30 minutes</span>
            <span className={styles.callPromoTag}>Sans engagement</span>
            <span className={styles.callPromoTag}>En visio ou par téléphone</span>
          </div>
        </section>

        {/* ── Booking ─────────────────────────────────────── */}
        <section id="reservation" className={styles.bookingSection}>
          <div className={styles.bookingWrapper}>
            <p className={styles.bookingSubtitle}>Rendez-vous</p>
            <h2 className={styles.bookingTitle}>Choisissez votre créneau</h2>
            <p className={styles.bookingText}>Sélectionnez le jour et l'heure qui vous conviennent pour un appel de 30 minutes.</p>

            <div className={styles.bookingGrid}>
              {/* Calendar Left Panel */}
              <div>
                <div className={styles.calHeader}>
                  <button onClick={() => shiftMonth(-1)} aria-label="Mois précédent" className={styles.calNavBtn}>‹</button>
                  <span className={styles.calMonthLabel} aria-live="polite">{MONTHS[month]} {year}</span>
                  <button onClick={() => shiftMonth(1)} aria-label="Mois suivant" className={styles.calNavBtn}>›</button>
                </div>
                
                <div className={styles.calWeekdays}>
                  {WEEKDAYS.map((wd, i) => (
                    <div key={i} className={styles.calWeekday}>{wd}</div>
                  ))}
                </div>
                
                <div className={styles.calDays}>
                  {cells.map((cell, i) => {
                    if (cell.type === 'hidden') {
                      return <div key={i} className={styles.calDayHidden}></div>;
                    }
                    let btnClass = styles.calDay;
                    if (cell.type === 'selected') btnClass += ` ${styles.calDaySelected}`;
                    else if (cell.type === 'available') btnClass += ` ${styles.calDayAvailable}`;
                    else btnClass += ` ${styles.calDayDisabled}`;

                    return (
                      <button
                        key={i}
                        disabled={cell.disabled}
                        className={btnClass}
                        onClick={() => {
                          if (!cell.disabled) {
                            setSelDay(cell.day as number);
                            setSelSlot(null);
                          }
                        }}
                        aria-pressed={cell.type === 'selected'}
                      >
                        {cell.label}
                      </button>
                    );
                  })}
                </div>
                <p className={styles.calNote}>Appels disponibles les mardis et jeudis.</p>
              </div>

              {/* Time Slots Right Panel */}
              <div className={styles.slotsPanel}>
                <p className={styles.slotsTitle}>Créneaux disponibles</p>
                {selDay ? (
                  <div className={styles.slotsGrid}>
                    {SLOTS.map(slot => (
                      <button 
                        key={slot}
                        className={`${styles.slotBtn} ${selSlot === slot ? styles.slotBtnSelected : ''}`}
                        onClick={() => setSelSlot(slot)}
                        aria-pressed={selSlot === slot}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={styles.slotsEmpty}>Sélectionnez d'abord un mardi ou un jeudi dans le calendrier.</p>
                )}
              </div>
            </div>

            <div className={styles.bookingConfirmArea}>
              <p className={styles.bookingRecap}>
                Votre appel : <b aria-live="polite">{recap}</b>
              </p>
              <button 
                disabled={!ready} 
                className={`${styles.bookingConfirmBtn} ${ready ? styles.bookingConfirmBtnReady : styles.bookingConfirmBtnDisabled}`}
                onClick={(e) => { e.preventDefault(); handleFormSubmit(e); }}
              >
                Confirmer le rendez-vous
              </button>
              
              {formStatus === 'dev_mock' && (
                <div className={styles.formMessage} style={{marginTop: '16px'}}>
                  [Mode Dev] Réservation simulée. Le backend n'est pas encore connecté.
                </div>
              )}
              {formStatus === 'error' && (
                <div className={styles.formMessage} style={{marginTop: '16px', borderColor: 'red'}}>
                  Service indisponible. Le serveur backend n'est pas encore configuré.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Contact Form ────────────────────────────────── */}
        <section className={styles.contactSection}>
          <div className={styles.contactWrapper}>
            <p className={styles.contactIntro}>Vous préférez écrire ? Remplissez le formulaire ci-dessous.</p>
            
            <div className={styles.contactLayout}>
              <form className={styles.form} onSubmit={handleFormSubmit}>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="tm-names" className={styles.formLabel}>Prénom(s) des futurs mariés</label>
                    <input id="tm-names" type="text" placeholder="Camille & Antoine" className={styles.formInput} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="tm-email" className={styles.formLabel}>Adresse e-mail</label>
                    <input id="tm-email" type="email" placeholder="vous@exemple.com" className={styles.formInput} required />
                  </div>
                </div>
                
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="tm-phone" className={styles.formLabel}>Téléphone (optionnel)</label>
                    <input id="tm-phone" type="tel" placeholder="06 12 34 56 78" className={styles.formInput} />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="tm-date" className={styles.formLabel}>Date du mariage</label>
                    <input id="tm-date" type="date" className={styles.formInput} required />
                  </div>
                </div>
                
                <div className={styles.formGroup}>
                  <label htmlFor="tm-lieu" className={styles.formLabel}>Lieu / région du mariage</label>
                  <input id="tm-lieu" type="text" placeholder="Provence, Île-de-France…" className={styles.formInput} required />
                </div>
                
                <div className={styles.formGroup}>
                  <label htmlFor="tm-formule" className={styles.formLabel}>Formule qui vous intéresse</label>
                  <select id="tm-formule" className={styles.formSelect} required>
                    <option value="">Sélectionner…</option>
                    <optgroup label="Photographie">
                      <option value="photo-essentiel">Photo — Essentiel</option>
                      <option value="photo-signature">Photo — Signature</option>
                      <option value="photo-prestige">Photo — Prestige</option>
                    </optgroup>
                    <optgroup label="Film">
                      <option value="film-essentiel">Film — Essentiel</option>
                      <option value="film-signature">Film — Signature</option>
                      <option value="film-prestige">Film — Prestige</option>
                    </optgroup>
                    <optgroup label="Photo & Film">
                      <option value="duo-essentiel">Photo & Film — Essentiel</option>
                      <option value="duo-signature">Photo & Film — Signature</option>
                      <option value="duo-prestige">Photo & Film — Prestige</option>
                    </optgroup>
                    <option value="sur-mesure">Sur-mesure</option>
                    <option value="ne-sais-pas">Je ne sais pas encore</option>
                  </select>
                </div>
                
                <div className={styles.formGroup}>
                  <label htmlFor="tm-message" className={styles.formLabel}>Votre message</label>
                  <textarea id="tm-message" rows={5} placeholder="Racontez-nous votre projet, vos envies, votre journée…" className={styles.formTextarea} required></textarea>
                </div>
                
                <button type="submit" className={styles.formSubmitBtn}>Envoyer</button>

                {formStatus === 'dev_mock' && (
                  <div className={styles.formMessage}>
                    [Mode Dev] Envoi simulé. Le backend n'est pas encore connecté pour traiter cet envoi.
                  </div>
                )}
                {formStatus === 'error' && (
                  <div className={styles.formMessage} style={{borderColor: 'red'}}>
                    Service d'envoi indisponible. Le serveur backend n'est pas encore configuré en production.
                  </div>
                )}
              </form>

              {/* Contact Details */}
              <div>
                <div className={styles.detailsBox}>
                  <p className={styles.detailsTitle}>Coordonnées</p>
                  <div className={styles.detailsList}>
                    <div>
                      <div className={styles.detailLabel}>E-mail</div>
                      <div>bonjour@timeless.be</div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Téléphone</div>
                      <div>+32 400 00 00 00</div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Zone d'intervention</div>
                      <div>Belgique entière & mariages à l'étranger</div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Réseaux</div>
                      <a href="#" className={styles.detailsLink}>Instagram</a>
                    </div>
                  </div>
                  <div className={styles.detailsDivider}></div>
                  <p className={styles.detailsNote}>Nous répondons sous 48h.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Formules Promo ──────────────────────────────── */}
        <section className={styles.promoSection}>
          <p className={styles.promoText}>
            Envie d'en savoir plus sur nos formules ?
            <a href="/fr/formules" className={styles.promoLink}>Voir nos formules</a>
          </p>
        </section>
      </main>

      <Footer lang="fr" />
      <ScrollTop />
    </div>
  );
}
