import type { Route } from "./+types/en.contact";
import { useState } from "react";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./contact.module.css";

export async function loader() {
  return { siteUrl: process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "" };
}

export function meta(args: Route.MetaArgs) {
  const data = (args as any).data || (args as any).loaderData;
  const base = data?.siteUrl ?? "";
  return [
    { title: "Contact — Timeless" },
    { name: "description", content: "Write to us, without obligation — we will take the time to answer you." },
    ...(base ? [
      { tagName: "link" as const, rel: "canonical", href: `${base}/en/contact` },
      { tagName: "link" as const, rel: "alternate", hrefLang: "fr", href: `${base}/fr/contact` },
      { tagName: "link" as const, rel: "alternate", hrefLang: "en", href: `${base}/en/contact` },
    ] : []),
  ];
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];
const SLOTS = ['10:00 – 10:30','10:30 – 11:00','11:00 – 11:30','11:30 – 12:00','14:00 – 14:30','14:30 – 15:00','15:00 – 15:30','15:30 – 16:00'];

export default function ContactEn() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selDay, setSelDay] = useState<number | null>(null);
  const [selSlot, setSelSlot] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<'idle' | 'error'>('idle');

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

  let recap = 'no time slot selected';
  if (selDay && selSlot) recap = `${MONTHS[month]} ${selDay}, ${year} at ${selSlot}`;
  else if (selDay) recap = `${MONTHS[month]} ${selDay}, ${year} — choose a time`;
  
  const ready = Boolean(selDay && selSlot);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Phase 3: submit to SSR action. For now, backend is not yet available.
    setFormStatus('error');
  };

  return (
    <div className={styles.container}>
      <Header lang="en" alternateLangHref="/fr/contact" />

      <main>
        {/* ── Hero ────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.heroDivider}></div>
          <h1 className={styles.heroTitle}>Let's tell your story.</h1>
          <p className={styles.heroText}>Write to us, without obligation — we will take the time to answer you.</p>
        </section>

        {/* ── Discovery Call Promo ────────────────────────── */}
        <section className={styles.callPromo}>
          <h2 className={styles.callPromoTitle}>Want to speak with us directly?</h2>
          <p className={styles.callPromoText}>A free, no-obligation discovery call to get to know each other and talk about your wedding.</p>
          <div className={styles.callPromoTags}>
            <span className={styles.callPromoTag}>30 minutes</span>
            <span className={styles.callPromoTag}>No obligation</span>
            <span className={styles.callPromoTag}>Video or phone</span>
          </div>
        </section>

        {/* ── Booking ─────────────────────────────────────── */}
        <section id="reservation" className={styles.bookingSection}>
          <div className={styles.bookingWrapper}>
            <p className={styles.bookingSubtitle}>Meeting</p>
            <h2 className={styles.bookingTitle}>Choose your time slot</h2>
            <p className={styles.bookingText}>Select the day and time that suits you for a 30-minute call.</p>

            <div className={styles.bookingGrid}>
              {/* Calendar Left Panel */}
              <div>
                <div className={styles.calHeader}>
                  <button onClick={() => shiftMonth(-1)} aria-label="Previous month" className={styles.calNavBtn}>‹</button>
                  <span className={styles.calMonthLabel} aria-live="polite">{MONTHS[month]} {year}</span>
                  <button onClick={() => shiftMonth(1)} aria-label="Next month" className={styles.calNavBtn}>›</button>
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
                <p className={styles.calNote}>Calls available on Tuesdays and Thursdays.</p>
              </div>

              {/* Time Slots Right Panel */}
              <div className={styles.slotsPanel}>
                <p className={styles.slotsTitle}>Available slots</p>
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
                  <p className={styles.slotsEmpty}>First select a Tuesday or Thursday in the calendar.</p>
                )}
              </div>
            </div>

            <div className={styles.bookingConfirmArea}>
              <p className={styles.bookingRecap}>
                Your call: <b aria-live="polite">{recap}</b>
              </p>
              <button 
                disabled={!ready} 
                className={`${styles.bookingConfirmBtn} ${ready ? styles.bookingConfirmBtnReady : styles.bookingConfirmBtnDisabled}`}
                onClick={(e) => { e.preventDefault(); handleFormSubmit(e); }}
              >
                Confirm meeting
              </button>
              
              {formStatus === 'error' && (
                <div className={styles.formMessage} style={{marginTop: '16px', borderColor: 'red'}}>
                  Service unavailable. The backend server is not configured yet.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Contact Form ────────────────────────────────── */}
        <section className={styles.contactSection}>
          <div className={styles.contactWrapper}>
            <p className={styles.contactIntro}>Prefer to write? Fill out the form below.</p>
            
            <div className={styles.contactLayout}>
              <form className={styles.form} onSubmit={handleFormSubmit}>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="tm-names" className={styles.formLabel}>First name(s) of the couple</label>
                    <input id="tm-names" type="text" placeholder="Camille & Antoine" className={styles.formInput} required />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="tm-email" className={styles.formLabel}>Email address</label>
                    <input id="tm-email" type="email" placeholder="you@example.com" className={styles.formInput} required />
                  </div>
                </div>
                
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="tm-phone" className={styles.formLabel}>Phone (optional)</label>
                    <input id="tm-phone" type="tel" placeholder="+32 4XX XX XX XX" className={styles.formInput} />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="tm-date" className={styles.formLabel}>Wedding date</label>
                    <input id="tm-date" type="date" className={styles.formInput} required />
                  </div>
                </div>
                
                <div className={styles.formGroup}>
                  <label htmlFor="tm-lieu" className={styles.formLabel}>Wedding location / region</label>
                  <input id="tm-lieu" type="text" placeholder="Belgium, France, Luxembourg…" className={styles.formInput} required />
                </div>
                
                <div className={styles.formGroup}>
                  <label htmlFor="tm-formule" className={styles.formLabel}>Package of interest</label>
                  <select id="tm-formule" className={styles.formSelect} required>
                    <option value="">Select…</option>
                    <optgroup label="Photography">
                      <option value="photo-essentiel">Photo — Essential</option>
                      <option value="photo-signature">Photo — Signature</option>
                      <option value="photo-prestige">Photo — Prestige</option>
                    </optgroup>
                    <optgroup label="Film">
                      <option value="film-essentiel">Film — Essential</option>
                      <option value="film-signature">Film — Signature</option>
                      <option value="film-prestige">Film — Prestige</option>
                    </optgroup>
                    <optgroup label="Photo & Film">
                      <option value="duo-essentiel">Photo & Film — Essential</option>
                      <option value="duo-signature">Photo & Film — Signature</option>
                      <option value="duo-prestige">Photo & Film — Prestige</option>
                    </optgroup>
                    <option value="sur-mesure">Custom</option>
                    <option value="ne-sais-pas">I don't know yet</option>
                  </select>
                </div>
                
                <div className={styles.formGroup}>
                  <label htmlFor="tm-message" className={styles.formLabel}>Your message</label>
                  <textarea id="tm-message" rows={5} placeholder="Tell us about your project, your desires, your day…" className={styles.formTextarea} required></textarea>
                </div>
                
                <button type="submit" className={styles.formSubmitBtn}>Send</button>

                {formStatus === 'error' && (
                  <div className={styles.formMessage} style={{borderColor: 'red'}}>
                    Sending service unavailable. The backend server is not yet configured in production.
                  </div>
                )}
              </form>

              {/* Contact Details - only render fields when real data is configured */}
              <div>
                <div className={styles.detailsBox}>
                  <p className={styles.detailsTitle}>Contact Details</p>
                  <div className={styles.detailsList}>
                    <div>
                      <div className={styles.detailLabel}>Coverage Area</div>
                      <div>All of Belgium &amp; destination weddings</div>
                    </div>
                  </div>
                  <div className={styles.detailsDivider}></div>
                  <p className={styles.detailsNote}>We reply within 48h.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Formules Promo ──────────────────────────────── */}
        <section className={styles.promoSection}>
          <p className={styles.promoText}>
            Want to know more about our packages?
            <a href="/en/pricing" className={styles.promoLink}>View our packages</a>
          </p>
        </section>
      </main>

      <Footer lang="en" />
      <ScrollTop />
    </div>
  );
}
