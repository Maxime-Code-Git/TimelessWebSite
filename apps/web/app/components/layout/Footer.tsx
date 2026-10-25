import { Link, useRouteLoaderData } from "react-router";
import type { Lang } from "~/lib/i18n";
import { getStrings } from "~/lib/i18n";
import styles from "./Footer.module.css";
import type { loader as rootLoader } from "../../root";
import { getActiveSocialNetworks } from "~/lib/social-networks";
import { SocialIcon } from "~/components/ui/SocialIcon";

interface FooterProps {
  lang: Lang;
}

export function Footer({ lang }: FooterProps) {
  const t = getStrings(lang).footer;
  const contactTo = lang === "fr" ? "/fr/contact" : "/en/contact";

  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const business = rootData?.siteContent?.business;
  const activeSocials = getActiveSocialNetworks(business?.socialNetworks);

  return (
    <footer className={styles.footer}>
      {/* Logo */}
      <Link to={lang === "fr" ? "/fr/" : "/en/"} aria-label="Sempra | Accueil">
        <img
          src="/brand/SempraFullWhite.png"
          alt="Sempra"
          width={2172}
          height={724}
          className={styles.footerLogo}
          loading="lazy"
        />
      </Link>

      {/* Social links - only render if active networks exist */}
      {activeSocials.length > 0 && (
        <div className={styles.socialRow} aria-label={lang === "fr" ? "Réseaux sociaux" : "Social media"}>
          {activeSocials.map((item) => (
            <a
              key={item.id}
              href={item.url}
              className={styles.socialLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={item.name}
            >
              <SocialIcon id={item.id} width={15} height={15} aria-hidden="true" />
              <span>{item.name}</span>
            </a>
          ))}
        </div>
      )}

      {/* Contact details - email & phone */}
      {(business?.email || (business?.phoneDisplay && business?.phoneE164)) && (
        <div className={styles.contactRow}>
          {business?.email && (
            <a
              href={`mailto:${business.email}`}
              className={styles.socialLink}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              {business.email}
            </a>
          )}
          {business?.phoneDisplay && business?.phoneE164 && (
            <a
              href={`tel:${business.phoneE164}`}
              className={styles.socialLink}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
              </svg>
              {business.phoneDisplay}
            </a>
          )}
        </div>
      )}

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
