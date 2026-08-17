import { useState } from "react";
import { Link } from "react-router";
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

  // Dummy calendar state for UI only
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // Generate a dummy month calendar (e.g. 1st is Tuesday)
  const emptyDays = 1; // 1 empty slot before day 1 (if Monday is first day)
  const daysInMonth = Array.from({ length: 30 }, (_, i) => i + 1);

  // Fake slots
  const availableSlots = ["10:00", "11:30", "14:00", "15:30", "17:00"];

  return (
    <>
      <Header lang={lang} alternateLangHref={alternateLangHref} />

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
                <span className={styles.calendarMonth}>{t.months[8]} 2026</span>
                <div className={styles.calendarNav}>
                  <button className={styles.calendarNavBtn} disabled>←</button>
                  <button className={styles.calendarNavBtn}>→</button>
                </div>
              </div>
              
              <div className={styles.calendarGrid}>
                {t.weekdays.map((wd, i) => (
                  <div key={i} className={styles.calendarWeekday}>{wd}</div>
                ))}
                
                {Array.from({ length: emptyDays }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                
                {daysInMonth.map((day) => {
                  const dayOfWeek = (emptyDays + day - 1) % 7;
                  const isAvailable = dayOfWeek === 1 || dayOfWeek === 3; // Tue or Thu
                  
                  return (
                    <button
                      key={day}
                      onClick={() => isAvailable && setSelectedDay(day)}
                      disabled={!isAvailable}
                      className={`${styles.calendarDay} ${
                        !isAvailable ? styles.disabled : ""
                      } ${selectedDay === day ? styles.selected : ""}`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          
          <div className={styles.slotsColumn}>
            <h4 className={styles.slotsTitle}>{t.slotsTitle}</h4>
            
            {!selectedDay ? (
              <div className={styles.slotsEmpty}>{t.slotsEmpty}</div>
            ) : (
              <>
                <div className={styles.slotsList}>
                  {availableSlots.map((time) => (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className={`${styles.slotBtn} ${
                        selectedTime === time ? styles.selected : ""
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
                
                <div className={styles.recapBox}>
                  {t.recapPrefix}
                  {selectedTime ? (
                    <b>{selectedDay} {t.months[8]} à {selectedTime}</b>
                  ) : (
                    <span className={styles.recapPlaceholder}>{t.recapChooseTime}</span>
                  )}
                </div>
                
                <button 
                  className={`btn btn--primary ${styles.confirmBtn}`}
                  disabled={!selectedTime}
                >
                  {t.confirmBtn}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Main Form */}
      <section className={styles.formSection}>
        <h3 className={styles.formPrompt}>{t.formPrompt}</h3>
        
        <div className={styles.formGrid}>
          <form onSubmit={(e) => e.preventDefault()}>
            <div className={styles.formGroup}>
              <label htmlFor="names" className={styles.label}>{t.formLabels.names}</label>
              <input type="text" id="names" className={styles.input} placeholder={t.formPlaceholders.names} />
            </div>
            
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="email" className={styles.label}>{t.formLabels.email}</label>
                <input type="email" id="email" className={styles.input} placeholder={t.formPlaceholders.email} />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="phone" className={styles.label}>{t.formLabels.phone}</label>
                <input type="tel" id="phone" className={styles.input} placeholder={t.formPlaceholders.phone} />
              </div>
            </div>
            
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="date" className={styles.label}>{t.formLabels.date}</label>
                <input type="date" id="date" className={styles.input} />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="location" className={styles.label}>{t.formLabels.location}</label>
                <input type="text" id="location" className={styles.input} placeholder={t.formPlaceholders.location} />
              </div>
            </div>
            
            <div className={styles.formGroup}>
              <label htmlFor="formula" className={styles.label}>{t.formLabels.formula}</label>
              <select id="formula" className={styles.select} defaultValue="">
                <option value="" disabled>{t.formPlaceholders.formulaDefault}</option>
                <option value="photo">Photographie</option>
                <option value="film">Film</option>
                <option value="duo">Duo (Photo + Film)</option>
                <option value="custom">{t.formPlaceholders.formulaSurMesure}</option>
                <option value="unknown">{t.formPlaceholders.formulaDontKnow}</option>
              </select>
            </div>
            
            <div className={styles.formGroup}>
              <label htmlFor="message" className={styles.label}>{t.formLabels.message}</label>
              <textarea id="message" className={styles.textarea} placeholder={t.formPlaceholders.message} />
            </div>
            
            <button type="submit" className={`btn btn--primary ${styles.submitBtn}`}>
              {t.formLabels.submit}
            </button>
          </form>
          
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

      <Footer lang={lang} />
    </>
  );
}
