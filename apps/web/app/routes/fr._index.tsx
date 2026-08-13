import type { Route } from "./+types/fr._index";
import { useState } from "react";
import { Link } from "react-router";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./fr._index.module.css";

// SSR meta — content present without JavaScript
export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Timeless — Photographe & Vidéaste de mariage en Belgique" },
    {
      name: "description",
      content:
        "Studio de photographie et vidéo de mariage haut de gamme en Belgique. Deux regards, un seul studio — arrêter le temps, garder l'émotion.",
    },
    { property: "og:title", content: "Timeless — Photo & Video de mariage" },
    {
      property: "og:description",
      content: "Studio de photographie et vidéo de mariage en Belgique. Un seul studio pour votre film et vos photographies.",
    },
    { property: "og:type", content: "website" },
    { property: "og:locale", content: "fr_BE" },
    { property: "og:locale:alternate", content: "en_BE" },
    { rel: "canonical", href: "https://timeless.be/fr/" },
    { tagName: "link", rel: "alternate", hrefLang: "fr", href: "https://timeless.be/fr/" },
    { tagName: "link", rel: "alternate", hrefLang: "en", href: "https://timeless.be/en/" },
    { tagName: "link", rel: "alternate", hrefLang: "x-default", href: "https://timeless.be/fr/" },
  ];
}

// SSR loader — will fetch real formules from DB in Phase 3
export async function loader(_args: Route.LoaderArgs) {
  // Placeholder data — matches maquette content exactly
  // In Phase 3: fetch from SQLite via API
  const FORMULES = {
    photo: [
      { name: "Essentiel", note: "Les moments clés,<br>en images.", featured: false },
      { name: "Signature", note: "Couverture photo<br>complète du jour.", featured: true },
      { name: "Prestige", note: "Reportage intégral<br>+ album d'art.", featured: false },
    ],
    film: [
      { name: "Essentiel", note: "Un film court,<br>l'émotion condensée.", featured: false },
      { name: "Signature", note: "Le film complet<br>de votre journée.", featured: true },
      { name: "Prestige", note: "Long métrage<br>+ teaser + rushes.", featured: false },
    ],
    duo: [
      { name: "Essentiel", note: "Photo et film,<br>l'essentiel réuni.", featured: false },
      { name: "Signature", note: "Photo + film,<br>couverture complète.", featured: true },
      { name: "Prestige", note: "L'expérience intégrale,<br>sans compromis.", featured: false },
    ],
  };
  return { formules: FORMULES };
}

type Cat = "photo" | "film" | "duo";

export default function HomePage({ loaderData }: Route.ComponentProps) {
  const { formules } = loaderData;
  const [cat, setCat] = useState<Cat>("duo");

  const LABELS: Record<Cat, string> = {
    photo: "Photographie",
    film: "Film",
    duo: "Photo & Film",
  };

  const currentFormules = formules[cat];

  return (
    <div style={{ background: "var(--ivory)", color: "var(--forest)" }}>
      <Header variant="home" lang="fr" alternateLangHref="/en/" />

      <main id="main-content">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className={styles.hero} aria-label="Présentation du studio">
          <div className={styles.heroOverlay} aria-hidden="true" />
          <div className={styles.heroContent}>
            <p className={styles.heroEyebrow}>Photo &amp; Vidéo de mariage</p>
            <h1 className={styles.heroTitle}>
              Arrêter le temps,
              <br />
              garder l'émotion.
            </h1>
            <p className={styles.heroSubtitle}>
              Un seul studio pour votre film et vos photographies.
            </p>
            <button
              className={styles.filmBtn}
              aria-label="Voir le film de présentation"
              type="button"
            >
              <span className={styles.filmBtnIcon} aria-hidden="true">
                ▶
              </span>
              Voir le film
            </button>
          </div>
        </section>

        {/* ── Texte éditorial ──────────────────────────────────── */}
        <section className={styles.editorial}>
          <div className="container">
            <div className="gold-divider" role="presentation" />
            <p className={styles.editorialText}>
              Le jour passe en un souffle. Notre métier est de le rendre{" "}
              <em className={styles.editorialEm}>éternel</em> — un film et des
              images qui, dans trente ans, vous feront ressentir exactement ce
              que vous vivez aujourd&apos;hui.
            </p>
          </div>
        </section>

        {/* ── Portfolio split ───────────────────────────────────── */}
        <section className={styles.portfolioSection}>
          <div className="container">
            <p className={styles.portfolioTitle}>Portfolio</p>
            <div className={styles.portfolioGrid}>
              <Link
                to="/fr/portfolio#photographie"
                className={`${styles.portfolioCard} ${styles.portfolioCardPhoto}`}
                aria-label="Voir le portfolio photographie"
              >
                <div>
                  <h2 className={styles.portfolioCardTitle}>Photographie</h2>
                  <small className={styles.portfolioCardSub}>Voir la galerie</small>
                </div>
              </Link>
              <Link
                to="/fr/portfolio#film"
                className={`${styles.portfolioCard} ${styles.portfolioCardFilm}`}
                aria-label="Voir les extraits vidéo"
              >
                <div>
                  <h2 className={styles.portfolioCardTitle}>Film</h2>
                  <small className={styles.portfolioCardSub}>Voir les extraits</small>
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* ── Formules preview ─────────────────────────────────── */}
        <section
          className={styles.formulesSection}
          aria-label="Aperçu des formules"
        >
          <div className="container">
            <p className={styles.formulesTitle}>Nos formules</p>

            {/* Category tabs */}
            <div className={styles.formuleTabs} role="tablist" aria-label="Catégories de formules">
              {(["photo", "film", "duo"] as Cat[]).map((key) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={cat === key}
                  onClick={() => setCat(key)}
                  className={`${styles.formuleTab} ${cat === key ? styles.active : ""}`}
                  type="button"
                >
                  {LABELS[key]}
                </button>
              ))}
            </div>

            {/* Tier cards */}
            <div className={styles.formuleCards} role="tabpanel">
              {currentFormules.map((tier, i) => (
                <article
                  key={`${cat}-${i}`}
                  className={`${styles.formuleCard} ${tier.featured ? styles.featured : ""}`}
                >
                  {tier.featured && (
                    <span className={styles.featuredBadge} aria-label="Le plus choisi">
                      Le plus choisi
                    </span>
                  )}
                  <div className={styles.formuleName}>{tier.name}</div>
                  {/* Tarif masqué si non renseigné — JAMAIS "— €" */}
                  <p
                    className={styles.formuleNote}
                    // Safe: note is controlled server-side, not user input
                    dangerouslySetInnerHTML={{ __html: tier.note }}
                  />
                </article>
              ))}
            </div>

            <p className={styles.formulesPromo}>
              Photo et film réunis sous un même studio :{" "}
              <b className={styles.formulesPromoHighlight}>
                une cohérence — et un tarif — impossibles à obtenir avec deux
                prestataires séparés.
              </b>
            </p>
            <p className={styles.formulesCaveat}>
              * Photos et vidéos conservées et disponibles pendant 24 mois
            </p>
            <div className={styles.formulesContactWrap}>
              <Link to="/fr/contact" className="btn btn--outline">
                Nous contacter
              </Link>
            </div>
            <p className={styles.formulesCustom}>
              Des besoins particuliers ?{" "}
              <em className={styles.formulesCustomEm}>
                Une demande sur-mesure est possible.
              </em>
            </p>
          </div>
        </section>

        {/* ── Studio duo ────────────────────────────────────────── */}
        <section className={styles.studioSection} aria-label="Notre studio">
          <div className="container">
            <div className={styles.studioGrid}>
              {/* Portrait placeholder — will show real team photo from CMS */}
              <div
                className={styles.studioImagePlaceholder}
                role="img"
                aria-label="Portrait de l'équipe du studio Timeless"
              />
              <div>
                <p className={styles.studioText}>
                  Deux regards, un seul studio.
                  <small className={styles.studioSubtext}>
                    L'un filme, l'autre photographie — mais nous travaillons
                    comme une seule main, présents ensemble le jour J pour ne
                    rien manquer de votre histoire.
                  </small>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer lang="fr" />
      <ScrollTop />
    </div>
  );
}
