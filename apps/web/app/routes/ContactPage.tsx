import { useEffect, useRef, useState } from "react";
import { useFetcher, useRouteLoaderData, Link, useSearchParams } from "react-router";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";

import type { loader as rootLoader } from "../root";
import { VisioBooking } from "~/components/booking/VisioBooking";
import styles from "./contact.module.css";

interface ContactPageProps {
  lang: Lang;
}

export function ContactPage({ lang }: ContactPageProps) {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const contactContent = rootData?.siteContent?.contactPage;
  if (!contactContent) throw new Error("ContactPage requires siteContent.contactPage to be loaded");
  const BUSINESS = rootData?.siteContent?.business;
  const [searchParams] = useSearchParams();
  const rawInitialFormula = searchParams.get("formula") || "";

  // Validate initial formula
  let initialFormula = "";
  const validFormulas = new Set<string>(["custom", "unknown"]);
  if (rootData?.siteContent?.pricing) {
    Object.entries(rootData.siteContent.pricing).forEach(([cat, formulas]) => {
      formulas.forEach(f => {
        if (f.enabled) {
          validFormulas.add(`${cat}-${f.id}`);
        }
      });
    });
  }

  if (validFormulas.has(rawInitialFormula)) {
    initialFormula = rawInitialFormula;
  }

  const [selectedFormula, setSelectedFormula] = useState<string>(initialFormula);

  const baseAltHref = lang === "fr" ? "/en/contact" : "/fr/contact";
  const alternateLangHref = selectedFormula ? `${baseAltHref}?formula=${selectedFormula}` : baseAltHref;

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
      setSelectedFormula("");
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
        <h1 className={styles.heroTitle}>{contactContent.hero.title[lang]}</h1>
        <p className={styles.heroSubtitle}>{contactContent.hero.subtitle[lang]}</p>
      </section>

      {/* Call Banner */}
      <section className={styles.callSection}>
        <h2 className={styles.callTitle}>{contactContent.introBanner.title[lang]}</h2>
        <p className={styles.callSubtitle}>{contactContent.introBanner.subtitle[lang]}</p>
        <div className={styles.badges}>
          {contactContent.introBanner.badges.map((badge) => (
            <span key={badge.id} className={styles.badge}>{badge.label[lang]}</span>
          ))}
        </div>
      </section>

      {/* Booking UI */}
      <section className={styles.bookingSection}>
          <div className={styles.bookingContainer}>
            <div className={styles.bookingIntro}>
              <p className={styles.bookingTitle}>{contactContent.bookingIntro.overtitle[lang]}</p>
              <h3 className={styles.bookingSubtitle}>{contactContent.bookingIntro.title[lang]}</h3>
              <p className={styles.bookingDesc}>{contactContent.bookingIntro.description[lang]}</p>
              <p className={styles.bookingNote}>{contactContent.bookingIntro.note[lang]}</p>
            </div>

            <VisioBooking language={lang} content={contactContent.visioBooking} />
          </div>
      </section>

        {/* Main Form */}
      <section className={styles.formSection}>
        <h3 className={styles.formPrompt}>{contactContent.contactForm.formPrompt[lang]}</h3>

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
                {contactContent.contactForm.successMsg[lang]}
              </div>
            )}
            <div className={styles.formGroup}>
              <label htmlFor="names" className={styles.label}>{contactContent.contactForm.labels.names[lang]}</label>
              <input type="text" id="names" name="names" required className={styles.input} placeholder={contactContent.contactForm.placeholders.names[lang]} />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="email" className={styles.label}>{contactContent.contactForm.labels.email[lang]}</label>
                <input type="email" id="email" name="email" required className={styles.input} placeholder={contactContent.contactForm.placeholders.email[lang]} />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="phone" className={styles.label}>{contactContent.contactForm.labels.phone[lang]}</label>
                <input type="tel" id="phone" name="phone" className={styles.input} placeholder={contactContent.contactForm.placeholders.phone[lang]} />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="date" className={styles.label}>{contactContent.contactForm.labels.date[lang]}</label>
                <input type="date" id="date" name="date" required className={styles.input} />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="location" className={styles.label}>{contactContent.contactForm.labels.location[lang]}</label>
                <input type="text" id="location" name="location" required className={styles.input} placeholder={contactContent.contactForm.placeholders.location[lang]} />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="formula" className={styles.label}>{contactContent.contactForm.labels.formula[lang]}</label>
              <select
                id="formula"
                name="formula"
                required
                className={styles.select}
                value={selectedFormula}
                onChange={e => setSelectedFormula(e.target.value)}
              >
                <option value="" disabled>{contactContent.contactForm.placeholders.formulaDefault[lang]}</option>
                {rootData?.siteContent?.pricing && Object.entries(rootData.siteContent.pricing).map(([cat, formulas]) => (
                  <optgroup key={cat} label={cat === 'photo' ? contactContent.contactForm.groupLabels.photo[lang] : cat === 'film' ? contactContent.contactForm.groupLabels.film[lang] : contactContent.contactForm.groupLabels.duo[lang]}>
                    {formulas.map(f => f.enabled && (
                      <option key={`${cat}-${f.id}`} value={`${cat}-${f.id}`}>
                        {f.name[lang]}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value="custom">{contactContent.contactForm.options.custom[lang]}</option>
                <option value="unknown">{contactContent.contactForm.options.unknown[lang]}</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="message" className={styles.label}>{contactContent.contactForm.labels.message[lang]}</label>
              <textarea id="message" name="message" required className={styles.textarea} placeholder={contactContent.contactForm.placeholders.message[lang]} />
            </div>

            <button type="submit" className={`btn btn--primary ${styles.submitBtn}`} disabled={isSubmitting}>
              {isSubmitting ? contactContent.contactForm.btnSubmitting[lang] : contactContent.contactForm.labels.submit[lang]}
            </button>
          </fetcher.Form>

          {/* Info Card with Real Config */}
          <div className={styles.infoCard}>
            <h4 className={styles.infoTitle}>{contactContent.contactDetails.title[lang]}</h4>

            {BUSINESS?.email && (
              <div className={styles.infoBlock}>
                <p className={styles.infoLabel}>{contactContent.contactDetails.labelEmail[lang]}</p>
                <p className={styles.infoValue}>
                  <a href={`mailto:${BUSINESS.email}`} className={styles.infoLink}>{BUSINESS.email}</a>
                </p>
              </div>
            )}

            {BUSINESS?.phoneDisplay && BUSINESS?.phoneE164 && (
              <div className={styles.infoBlock}>
                <p className={styles.infoLabel}>{contactContent.contactDetails.labelPhone[lang]}</p>
                <p className={styles.infoValue}>
                  <a href={`tel:${BUSINESS.phoneE164}`} className={styles.infoLink}>{BUSINESS.phoneDisplay}</a>
                </p>
              </div>
            )}

            {BUSINESS?.serviceArea && (
              <div className={styles.infoBlock}>
                <p className={styles.infoLabel}>{contactContent.contactDetails.labelArea[lang]}</p>
                <p className={styles.infoValue}>{BUSINESS.serviceArea[lang]}</p>
              </div>
            )}

            {(BUSINESS?.instagramUrl || BUSINESS?.linkedinUrl) && (
              <div className={styles.infoBlock}>
                <p className={styles.infoLabel}>{contactContent.contactDetails.labelSocial[lang]}</p>
                <p className={styles.infoValue}>
                  {BUSINESS.instagramUrl && (
                    <a href={BUSINESS.instagramUrl} className={styles.infoLink} target="_blank" rel="noopener noreferrer">{contactContent.contactDetails.labelInstagram[lang]}</a>
                  )}
                  {BUSINESS.instagramUrl && BUSINESS.linkedinUrl && " | "}
                  {BUSINESS.linkedinUrl && (
                    <a href={BUSINESS.linkedinUrl} className={styles.infoLink} target="_blank" rel="noopener noreferrer">{contactContent.contactDetails.labelLinkedin[lang]}</a>
                  )}
                </p>
              </div>
            )}

            <p className={styles.responseTime}>{contactContent.contactDetails.responseTime[lang]}</p>
          </div>
        </div>
      </section>

      {/* Bottom Banner */}
      <section className={styles.bannerSection}>
        <p className={styles.bannerText}>{contactContent.bottomBanner.text[lang]}</p>
        <Link to={lang === "fr" ? "/fr/formules" : "/en/pricing"} className="btn btn--outline">
          {contactContent.bottomBanner.linkLabel[lang]}
        </Link>
      </section>
      </main>

      <Footer lang={lang} />
    </>
  );
}
