import { Link } from "react-router";
import type { Lang } from "~/lib/i18n";
import { getStrings } from "~/lib/i18n";
import { BUSINESS } from "~/lib/business-config";
import styles from "./Footer.module.css";

interface FooterProps {
  lang: Lang;
}

export function Footer({ lang }: FooterProps) {
  const t = getStrings(lang).footer;
  const contactTo = lang === "fr" ? "/fr/contact" : "/en/contact";

  return (
    <footer className={styles.footer}>
      {/* Logo */}
      <Link to={lang === "fr" ? "/fr/" : "/en/"} aria-label="Timeless — Accueil">
        <img
          src="/logo-officiel.png"
          alt="Timeless"
          className={styles.footerLogo}
          loading="lazy"
        />
      </Link>

      {/* Social links — only render if URLs are configured */}
      <div className={styles.socialRow}>
        {BUSINESS.instagramUrl && (
          <a
            href={BUSINESS.instagramUrl}
            className={styles.socialLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="2" width="20" height="20" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" />
            </svg>
            {t.instagram}
          </a>
        )}
        {BUSINESS.linkedinUrl && (
          <a
            href={BUSINESS.linkedinUrl}
            className={styles.socialLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="2" width="20" height="20" rx="3" />
              <line x1="7" y1="10" x2="7" y2="17" />
              <circle cx="7" cy="6.8" r="0.9" />
              <path d="M11 17v-4a2.5 2.5 0 0 1 5 0v4" />
              <line x1="11" y1="10" x2="11" y2="17" />
            </svg>
            {t.linkedin}
          </a>
        )}
        {BUSINESS.phone && (
          <a
            href={BUSINESS.phoneHref}
            className={styles.socialLink}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
            </svg>
            {BUSINESS.phone}
          </a>
        )}
      </div>

      {/* Contact CTA */}
      <Link to={contactTo} className={styles.contactBtn}>
        {t.contactBtn}
      </Link>

      {/* Divider */}
      <div className={styles.divider} role="separator" />

      {/* Legal links */}
      <nav aria-label={lang === "fr" ? "Liens légaux" : "Legal links"} className={styles.legalLinks}>
        {t.legalLinks.map(({ label, to }) => (
          <Link key={to} to={to} className={styles.legalLink}>
            {label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
