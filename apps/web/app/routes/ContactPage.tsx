import { useEffect, useRef } from "react";
import { Link, useFetcher } from "react-router";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";
import { getStrings } from "~/lib/i18n";
import { BUSINESS } from "~/lib/business-config";
import styles from "./contact.module.css";

interface ContactPageProps {
  lang: Lang;
}

export function ContactPage({ lang }: ContactPageProps) {
  const t = getStrings(lang).contact;
  const alternateLangHref = lang === "fr" ? "/en/contact" : "/fr/contact";

  const fetcher = useFetcher();
  const isSubmitting = fetcher.state === "submitting";
  const success = fetcher.data?.success;
  const errorMsg = fetcher.data?.error;
  
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fetcher.data?.success && formRef.current) {
      formRef.current.reset();
      successRef.current?.focus();
    }
    if (fetcher.data?.error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [fetcher.data]);

  return (
    <>
      <Header lang={lang} alternateLangHref={alternateLangHref} />

      <main id="main-content">

      {/* Hero Section */}
      <section className={styles.heroSection}>
        <div className={styles.heroDivider} />
        <h1 className={styles.heroTitle}>{t.heroTitle}</h1>
        <p className={styles.heroSubtitle}>{t.heroSubtitle}</p>
      </section>

      {/* Call Banner */}
      <section className={styles.callSection}>
        <h2 className={styles.callTitle}>{t.callTitle}</h2>
        <p className={styles.callSubtitle}>{t.callSubtitle}</p>
        <div className={styles.badges}>
          {t.callBadges.map((badge, i) => (
            <span key={i} className={styles.badge}>{badge}</span>
          ))}
        </div>
      </section>

      {/* Booking UI */}
      <section className={styles.bookingSection}>
        <div className={styles.bookingGrid}>
          <div>
            <div className={styles.bookingIntro}>
              <p className={styles.bookingTitle}>{t.bookingTitle}</p>
              <h3 className={styles.bookingSubtitle}>{t.bookingSubtitle}</h3>
              <p className={styles.bookingDesc}>{t.bookingDescription}</p>
              <p className={styles.bookingNote}>{t.bookingNote}</p>
            </div>
            
            <div className={styles.calendarCard}>
              <div className={styles.calendarHeader}>
                <span className={styles.calendarMonth}>
                  {lang === "fr" ? "Réservation en ligne" : "Online booking"}
                </span>
              </div>
              <div className={styles.slotsEmpty}>
                {lang === "fr"
                  ? "La réservation en ligne est temporairement indisponible. Veuillez nous écrire directement via le formulaire ou par e-mail."
                  : "Online booking is temporarily unavailable. Please contact us directly via the form or by email."}
              </div>
            </div>
          </div>
          
          <div role="alert" className={styles.unavailableAlert}>
            {t.submitUnavailable}
          </div>
        </div>
      </section>

      {/* Main Form */}
      <section className={styles.formSection}>
        <h3 className={styles.formPrompt}>{t.formPrompt}</h3>
        
        <div className={styles.formGrid}>
          <fetcher.Form method="post" ref={formRef} action={lang === "fr" ? "/fr/contact" : "/en/contact"}>
            {/* Honeypot field - must be hidden to humans */}
            <div className={styles.honeypot} aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
            </div>

            {errorMsg && (
              <div className={styles.formError} role="alert" tabIndex={-1} ref={errorRef}>
                {errorMsg}
              </div>
            )}
            
            {success && (
              <div 
                className={styles.formSuccess} 
                role="status" 
                tabIndex={-1} 
                ref={successRef}
              >
                {lang === "fr" 
                  ? "Votre message a bien été envoyé. Nous vous répondrons sous 48 h." 
                  : "Your message has been sent successfully. We will reply within 48 hours."}
              </div>
            )}
            <div className={styles.formGroup}>
              <label htmlFor="names" className={styles.label}>{t.formLabels.names}</label>
              <input type="text" id="names" name="names" required className={styles.input} placeholder={t.formPlaceholders.names} />
            </div>
            
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="email" className={styles.label}>{t.formLabels.email}</label>
                <input type="email" id="email" name="email" required className={styles.input} placeholder={t.formPlaceholders.email} />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="phone" className={styles.label}>{t.formLabels.phone}</label>
                <input type="tel" id="phone" name="phone" className={styles.input} placeholder={t.formPlaceholders.phone} />
              </div>
            </div>
            
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="date" className={styles.label}>{t.formLabels.date}</label>
                <input type="date" id="date" name="date" required className={styles.input} />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="location" className={styles.label}>{t.formLabels.location}</label>
                <input type="text" id="location" name="location" required className={styles.input} placeholder={t.formPlaceholders.location} />
              </div>
            </div>
            
            <div className={styles.formGroup}>
              <label htmlFor="formula" className={styles.label}>{t.formLabels.formula}</label>
              <select id="formula" name="formula" required className={styles.select} defaultValue="">
                <option value="" disabled>{t.formPlaceholders.formulaDefault}</option>
                <option value="photo">{lang === "fr" ? "Photographie" : "Photography"}</option>
                <option value="film">Film</option>
                <option value="duo">Duo (Photo + Film)</option>
                <option value="custom">{t.formPlaceholders.formulaSurMesure}</option>
                <option value="unknown">{t.formPlaceholders.formulaDontKnow}</option>
              </select>
            </div>
            
            <div className={styles.formGroup}>
              <label htmlFor="message" className={styles.label}>{t.formLabels.message}</label>
              <textarea id="message" name="message" required className={styles.textarea} placeholder={t.formPlaceholders.message} />
            </div>
            
            <button type="submit" className={`btn btn--primary ${styles.submitBtn}`} disabled={isSubmitting}>
              {isSubmitting ? (lang === "fr" ? "Envoi..." : "Sending...") : t.formLabels.submit}
            </button>
          </fetcher.Form>
          
          {/* Info Card with Real Config */}
          <div className={styles.infoCard}>
            <h4 className={styles.infoTitle}>{t.coordTitle}</h4>
            
            {BUSINESS.email && (
              <div className={styles.infoBlock}>
                <p className={styles.infoLabel}>{t.coordLabels.email}</p>
                <p className={styles.infoValue}>
                  <a href={BUSINESS.emailHref} className={styles.infoLink}>{BUSINESS.email}</a>
                </p>
              </div>
            )}
            
            {BUSINESS.phone && (
              <div className={styles.infoBlock}>
                <p className={styles.infoLabel}>{t.coordLabels.phone}</p>
                <p className={styles.infoValue}>
                  <a href={BUSINESS.phoneHref} className={styles.infoLink}>{BUSINESS.phone}</a>
                </p>
              </div>
            )}
            
            <div className={styles.infoBlock}>
              <p className={styles.infoLabel}>{t.coordLabels.area}</p>
              <p className={styles.infoValue}>{BUSINESS.serviceArea[lang]}</p>
            </div>
            
            {(BUSINESS.instagramUrl || BUSINESS.linkedinUrl) && (
              <div className={styles.infoBlock}>
                <p className={styles.infoLabel}>{t.coordLabels.social}</p>
                <p className={styles.infoValue}>
                  {BUSINESS.instagramUrl && (
                    <a href={BUSINESS.instagramUrl} className={styles.infoLink} target="_blank" rel="noopener noreferrer">Instagram</a>
                  )}
                  {BUSINESS.instagramUrl && BUSINESS.linkedinUrl && " — "}
                  {BUSINESS.linkedinUrl && (
                    <a href={BUSINESS.linkedinUrl} className={styles.infoLink} target="_blank" rel="noopener noreferrer">LinkedIn</a>
                  )}
                </p>
              </div>
            )}
            
            <p className={styles.responseTime}>{t.coordResponseTime}</p>
          </div>
        </div>
      </section>

      {/* Bottom Banner */}
      <section className={styles.bannerSection}>
        <p className={styles.bannerText}>{t.bannerText}</p>
        <Link to={lang === "fr" ? "/fr/formules" : "/en/pricing"} className="btn btn--outline">
          {t.bannerLink}
        </Link>
      </section>
      </main>

      <Footer lang={lang} />
    </>
  );
}
