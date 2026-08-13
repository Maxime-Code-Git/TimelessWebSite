import { NavLink, Link } from "react-router";
import styles from "./Header.module.css";

interface HeaderProps {
  /** Show the large logo (homepage) or compact logo (inner pages) */
  variant?: "home" | "page";
  /** Current language */
  lang?: "fr" | "en";
  /** Alternate language URL for the switcher */
  alternateLangHref?: string;
}

const NAV_LINKS = {
  fr: [
    { to: "/fr/portfolio", label: "Portfolio" },
    { to: "/fr/formules", label: "Formules" },
    { to: "/fr/a-propos", label: "À propos" },
    { to: "/fr/contact", label: "Contact" },
  ],
  en: [
    { to: "/en/portfolio", label: "Portfolio" },
    { to: "/en/pricing", label: "Pricing" },
    { to: "/en/about", label: "About" },
    { to: "/en/contact", label: "Contact" },
  ],
};

const CLIENT_AREA = {
  fr: { to: "/fr/espace-clients", label: "Espace clients" },
  en: { to: "/en/client-area", label: "Client area" },
};

export function Header({
  variant = "page",
  lang = "fr",
  alternateLangHref,
}: HeaderProps) {
  const links = NAV_LINKS[lang];
  const clientArea = CLIENT_AREA[lang];
  const isHome = variant === "home";

  const altLang = lang === "fr" ? "en" : "fr";
  const altLangLabel = lang === "fr" ? "EN" : "FR";
  const curLangLabel = lang === "fr" ? "FR" : "EN";

  return (
    <header className={styles.header}>
      <Link to={lang === "fr" ? "/fr/" : "/en/"} aria-label="Timeless — Accueil">
        <img
          src="/logo-officiel.png"
          alt="Timeless Photo & Video"
          className={`${styles.logo} ${isHome ? styles.logoLarge : styles.logoCompact}`}
          width={isHome ? 173 : undefined}
          height={isHome ? 173 : 96}
        />
      </Link>

      <nav
        className={styles.nav}
        aria-label={lang === "fr" ? "Navigation principale" : "Main navigation"}
      >
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
            }
          >
            {label}
          </NavLink>
        ))}

        <Link to={clientArea.to} className={styles.clientBtn}>
          {clientArea.label}
        </Link>

        {/* Language switcher */}
        <span className={styles.langSwitcher} aria-label="Sélecteur de langue">
          <span className={styles.langActive}>{curLangLabel}</span>
          <span className={styles.langDot}>·</span>
          {alternateLangHref ? (
            <Link
              to={alternateLangHref}
              className={styles.langInactive}
              hrefLang={altLang}
              aria-label={`Switch to ${altLangLabel}`}
            >
              {altLangLabel}
            </Link>
          ) : (
            <span className={styles.langInactive}>{altLangLabel}</span>
          )}
        </span>
      </nav>
    </header>
  );
}
