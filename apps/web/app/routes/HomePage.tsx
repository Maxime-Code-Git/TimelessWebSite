import { useState } from "react";
import { Link } from "react-router";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";
import { getStrings } from "~/lib/i18n";
import { PRICING, formatPrice } from "~/lib/pricing";
import type { FormulaCategory } from "~/lib/pricing";
import styles from "./home.module.css";

interface HomePageProps {
  lang: Lang;
}

export function HomePage({ lang }: HomePageProps) {
  const t = getStrings(lang).home;
  const [selectedCat, setSelectedCat] = useState<FormulaCategory>("duo");

  // Determine alternate language link
  const alternateLangHref = lang === "fr" ? "/en/" : "/fr/";

  const handleCategoryClick = (cat: FormulaCategory) => {
    setSelectedCat(cat);
  };

  const categories: FormulaCategory[] = ["photo", "film", "duo"];
  const currentPricing = PRICING[selectedCat];

  return (
    <>
      {/* 1. Header */}
      <Header variant="home" lang={lang} alternateLangHref={alternateLangHref} />

      <main id="main-content">
      {/* 2. Hero */}
      <section className={styles.hero}>
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <p className={styles.heroEyebrow}>{t.heroEyebrow}</p>
          <h1 className={styles.heroTitle}>
            {t.heroTitle.split("\n").map((line, i) => (
              <span key={i}>
                {line}
                {i === 0 && <br />}
              </span>
            ))}
          </h1>
          <p className={styles.heroSubtitle}>{t.heroSubtitle}</p>
          <button className={styles.filmBtn}>
            <span className={styles.filmBtnIcon}>►</span>
            {t.heroFilmBtn}
          </button>
        </div>
      </section>

      {/* 3. Éditorial */}
      <section className={styles.editorial}>
        <div className={styles.editorialInner}>
          <div className={styles.editorialDivider} />
          <p className={styles.editorialText}>
            {t.editorialText}{" "}
            <em className={styles.editorialEm}>{t.editorialEmphasis}</em> —{" "}
            {lang === "fr"
              ? "un film et des images qui, dans trente ans, vous feront ressentir exactement ce que vous vivez aujourd'hui."
              : "a film and images that, in thirty years, will make you feel exactly what you are living today."}
          </p>
        </div>
      </section>

      {/* 4. Portfolio split */}
      <section className={styles.portfolioSection}>
        <div className={styles.portfolioInner}>
          <p className={styles.portfolioTitle}>{t.portfolioTitle}</p>
          <div className={styles.portfolioGrid}>
            <Link
              to={lang === "fr" ? "/fr/portfolio" : "/en/portfolio"}
              className={`${styles.portfolioCard} ${styles.portfolioCardPhoto}`}
            >
              <div>
                <h3 className={styles.portfolioCardTitle}>{t.portfolioPhoto}</h3>
                <small className={styles.portfolioCardSub}>{t.portfolioPhotoSub}</small>
              </div>
            </Link>
            <Link
              to={lang === "fr" ? "/fr/portfolio" : "/en/portfolio"}
              className={`${styles.portfolioCard} ${styles.portfolioCardFilm}`}
            >
              <div>
                <h3 className={styles.portfolioCardTitle}>{t.portfolioFilm}</h3>
                <small className={styles.portfolioCardSub}>{t.portfolioFilmSub}</small>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* 5. Formules preview */}
      <section className={styles.formulesSection}>
        <div className={styles.formulesInner}>
          <p className={styles.formulesTitle}>{t.formulesTitle}</p>

          <div className={styles.formuleTabs}>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategoryClick(cat)}
                className={`${styles.formuleTab} ${
                  selectedCat === cat ? styles.active : ""
                }`}
              >
                {t.categoryLabels[cat]}
              </button>
            ))}
          </div>

          <div className={styles.formuleCards}>
            {currentPricing.map((tier) => (
              <div
                key={tier.id}
                className={`${styles.formuleCard} ${
                  tier.featured ? styles.featured : ""
                }`}
              >
                {tier.featured && (
                  <span className={styles.featuredBadge}>{t.featuredBadge}</span>
                )}
                <div className={styles.formuleName}>{getStrings(lang).tierNames[tier.id]}</div>
                <div className={styles.formulePrice}>
                  {formatPrice(tier.priceCents, lang)}
                </div>
                <div
                  className={styles.formuleNote}
                  dangerouslySetInnerHTML={{
                    __html: getFormulaNote(selectedCat, tier.id, lang),
                  }}
                />
              </div>
            ))}
          </div>

          <p className={styles.formulesPromo}>
            {t.formulesPromo}
            <b className={styles.formulesPromoHighlight}>{t.formulesPromoBold}</b>
          </p>
          <p className={styles.formulesCaveat}>{t.formulesCaveat}</p>

          <div className={styles.formulesContactWrap}>
            <Link
              to={lang === "fr" ? "/fr/contact" : "/en/contact"}
              className="btn btn--outline"
            >
              {t.formulesContact}
            </Link>
          </div>

          <p className={styles.formulesCustom}>
            {t.formulesCustom}{" "}
            <em className={styles.formulesCustomEm}>{t.formulesCustomEm}</em>
          </p>
        </div>
      </section>

      {/* 6. Studio duo */}
      <section className={styles.studioSection}>
        <div className={styles.studioInner}>
          <div className={styles.studioGrid}>
            <div className={styles.studioImagePlaceholder} />
            <div className={styles.studioTitle}>
              {t.studioTitle}
              <small className={styles.studioText}>{t.studioText}</small>
            </div>
          </div>
        </div>
      </section>
      </main>

      {/* 7. Footer */}
      <Footer lang={lang} />
    </>
  );
}

// Helper pour les notes (taglines) des cartes sur l'accueil
function getFormulaNote(cat: string, tierId: string, lang: Lang): string {
  if (lang === "fr") {
    if (cat === "photo") {
      if (tierId === "essential") return "Les moments clés,<br>en images.";
      if (tierId === "signature") return "Couverture photo<br>complète du jour.";
      if (tierId === "prestige") return "Reportage intégral<br>+ album d'art.";
    }
    if (cat === "film") {
      if (tierId === "essential") return "Un film court,<br>l'émotion condensée.";
      if (tierId === "signature") return "Le film complet<br>de votre journée.";
      if (tierId === "prestige") return "Long métrage<br>+ teaser + rushes.";
    }
    if (cat === "duo") {
      if (tierId === "essential") return "Photo et film,<br>l'essentiel réuni.";
      if (tierId === "signature") return "Photo + film,<br>couverture complète.";
      if (tierId === "prestige") return "L'expérience intégrale,<br>sans compromis.";
    }
  } else {
    // English
    if (cat === "photo") {
      if (tierId === "essential") return "Key moments,<br>in images.";
      if (tierId === "signature") return "Complete photo coverage<br>of the day.";
      if (tierId === "prestige") return "Full reportage<br>+ fine-art album.";
    }
    if (cat === "film") {
      if (tierId === "essential") return "A short film,<br>condensed emotion.";
      if (tierId === "signature") return "The complete film<br>of your day.";
      if (tierId === "prestige") return "Feature film<br>+ teaser + raw footage.";
    }
    if (cat === "duo") {
      if (tierId === "essential") return "Photo & film,<br>the essentials combined.";
      if (tierId === "signature") return "Photo + film,<br>complete coverage.";
      if (tierId === "prestige") return "The ultimate experience,<br>without compromise.";
    }
  }
  return "";
}
