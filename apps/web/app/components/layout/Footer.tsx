import { Link } from "react-router";
import styles from "./Footer.module.css";

interface FooterProps {
  lang?: "fr" | "en";
}

// SVG icons matching maquettes exactly (stroke="#BA996B", width="15", height="15")
const InstagramIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#BA996B"
    strokeWidth="1.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="2" y="2" width="20" height="20" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" />
  </svg>
);

const LinkedInIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#BA996B"
    strokeWidth="1.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="2" y="2" width="20" height="20" rx="3" />
    <line x1="7" y1="10" x2="7" y2="17" />
    <circle cx="7" cy="6.8" r="0.9" />
    <path d="M11 17v-4a2.5 2.5 0 0 1 5 0v4" />
    <line x1="11" y1="10" x2="11" y2="17" />
  </svg>
);

const PhoneIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#BA996B"
    strokeWidth="1.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </svg>
);

const CONTENT = {
  fr: {
    contact: "Nous contacter",
    clientArea: "Espace clients",
    legal: "Mentions légales",
    cgv: "CGV",
    privacy: "Confidentialité",
    contactPath: "/fr/contact",
    clientPath: "/fr/espace-clients",
    legalPath: "/fr/mentions-legales",
    cgvPath: "/fr/cgv",
    privacyPath: "/fr/confidentialite",
  },
  en: {
    contact: "Contact us",
    clientArea: "Client area",
    legal: "Legal notice",
    cgv: "Terms",
    privacy: "Privacy",
    contactPath: "/en/contact",
    clientPath: "/en/client-area",
    legalPath: "/en/legal",
    cgvPath: "/en/terms",
    privacyPath: "/en/privacy",
  },
};

// TODO: These will come from CMS/admin settings
const PLACEHOLDER_SOCIAL = {
  instagram: "#",       // Replace in admin
  linkedin: "#",        // Replace in admin
  phone: "+32 4XX XX XX XX", // Replace in admin
  phoneHref: "tel:+32400000000",
};

export function Footer({ lang = "fr" }: FooterProps) {
  const t = CONTENT[lang];

  return (
    <footer className={styles.footer}>
      <Link to={lang === "fr" ? "/fr/" : "/en/"} aria-label="Timeless — Accueil">
        <img
          src="/logo-officiel.png"
          alt="Timeless Photo & Video"
          className={styles.footerLogo}
          loading="lazy"
        />
      </Link>

      <div className={styles.social}>
        <a
          href={PLACEHOLDER_SOCIAL.instagram}
          className={styles.socialLink}
          aria-label="Instagram"
          rel="noopener noreferrer"
          target={PLACEHOLDER_SOCIAL.instagram !== "#" ? "_blank" : undefined}
        >
          <InstagramIcon />
          Instagram
        </a>
        <a
          href={PLACEHOLDER_SOCIAL.linkedin}
          className={styles.socialLink}
          aria-label="LinkedIn"
          rel="noopener noreferrer"
          target={PLACEHOLDER_SOCIAL.linkedin !== "#" ? "_blank" : undefined}
        >
          <LinkedInIcon />
          LinkedIn
        </a>
        <a
          href={PLACEHOLDER_SOCIAL.phoneHref}
          className={styles.socialLink}
          aria-label={`Téléphone : ${PLACEHOLDER_SOCIAL.phone}`}
        >
          <PhoneIcon />
          {PLACEHOLDER_SOCIAL.phone}
        </a>
      </div>

      <Link to={t.contactPath} className={styles.contactBtn}>
        {t.contact}
      </Link>

      <div className={styles.divider} role="separator" />

      <nav className={styles.legalLinks} aria-label="Liens légaux">
        <Link to={t.clientPath} className={styles.legalLink}>
          {t.clientArea}
        </Link>
        <Link to={t.legalPath} className={styles.legalLink}>
          {t.legal}
        </Link>
        <Link to={t.cgvPath} className={styles.legalLink}>
          {t.cgv}
        </Link>
        <Link to={t.privacyPath} className={styles.legalLink}>
          {t.privacy}
        </Link>
      </nav>
    </footer>
  );
}
