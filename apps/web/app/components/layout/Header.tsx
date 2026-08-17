import { NavLink, Link } from "react-router";
import type { Lang } from "~/lib/i18n";
import { getStrings } from "~/lib/i18n";
import styles from "./Header.module.css";

interface HeaderProps {
  /** Show the large logo (homepage) or compact logo (inner pages) */
  variant?: "home" | "page";
  /** Current language */
  lang?: Lang;
  /** Alternate language URL for the switcher */
  alternateLangHref?: string;
  /** Hide the navigation entirely */
  hideNav?: boolean;
}

const NAV_LINKS = {
  fr: [
    { to: "/fr/portfolio", key: "portfolio" },
    { to: "/fr/formules", key: "formules" },
    { to: "/fr/a-propos", key: "about" },
    { to: "/fr/contact", key: "contact" },
  ],
  en: [
    { to: "/en/portfolio", key: "portfolio" },
    { to: "/en/pricing", key: "formules" },
    { to: "/en/about", key: "about" },
    { to: "/en/contact", key: "contact" },
  ],
} as const;

const CLIENT_AREA = {
  fr: "/fr/espace-clients",
  en: "/en/client-area",
} as const;

export function Header({
  variant = "page",
  lang = "fr",
  alternateLangHref,
  hideNav = false,
}: HeaderProps) {
  const t = getStrings(lang).nav;
  const links = NAV_LINKS[lang];
  const clientAreaTo = CLIENT_AREA[lang];
  const isHome = variant === "home";

  const altLang = lang === "fr" ? "en" : "fr";
  const altLangLabel = lang === "fr" ? "EN" : "FR";
  const curLangLabel = lang === "fr" ? "FR" : "EN";

  const labelMap: Record<string, string> = {
    portfolio: t.portfolio,
    formules: t.formules,
    about: t.about,
    contact: t.contact,
  };

  return (
    <header className={styles.header}>
      <Link to={lang === "fr" ? "/fr/" : "/en/"} aria-label="Timeless — Accueil">
        <img
          src="/logo-officiel.png"
          alt="Timeless"
          className={isHome ? styles.logoLarge : styles.logoCompact}
        />
      </Link>

      {!hideNav && (
        <nav
          className={styles.nav}
          aria-label={lang === "fr" ? "Navigation principale" : "Main navigation"}
        >
          {links.map(({ to, key }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive ? `${styles.navLink} active` : styles.navLink
              }
            >
              {labelMap[key]}
            </NavLink>
          ))}

          <Link to={clientAreaTo} className={styles.clientBtn}>
            {t.clientArea}
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
      )}
    </header>
  );
}
