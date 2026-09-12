import { useState } from "react";
import { Link, useRouteLoaderData } from "react-router";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";
import { getStrings } from "~/lib/i18n";
import { formatPrice } from "~/lib/pricing";
import type { FormulaCategory } from "~/lib/pricing";
import styles from "./home.module.css";
import type { loader as rootLoader } from "../root";
import type { HomeContent, HomeImageMetadata } from "../lib/site-content.server";
interface HomePageProps {
  lang: Lang;
}
export function HomePage({ lang }: HomePageProps) {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const siteContent = rootData?.siteContent;
  const categories: FormulaCategory[] = ["photo", "film", "duo"];
  const activeCategories = categories.filter(cat => (siteContent?.pricing[cat] || []).some(f => f.enabled));
  const defaultCat = activeCategories.includes("duo") ? "duo" : activeCategories.length > 0 ? activeCategories[0] : "photo";

  const [selectedCat, setSelectedCat] = useState<FormulaCategory>(defaultCat);
  const t = getStrings(lang).home;
  const homeContent = siteContent?.home as HomeContent | undefined;
  // Determine alternate language link
  const alternateLangHref = lang === "fr" ? "/en/" : "/fr/";
  const handleCategoryClick = (cat: FormulaCategory) => {
    setSelectedCat(cat);
  };
  const currentPricing = (siteContent?.pricing[selectedCat] || []).filter(f => f.enabled);
  if (!homeContent) return null; // Wait for loader
  return (
    <>
      {/* 1. Header */}
      <Header variant="home" lang={lang} alternateLangHref={alternateLangHref} />
      <main id="main-content">
      {/* 2. Hero */}
      <section className={styles.hero}>
        <div className={styles.heroImagesWrapper}>
          {homeContent.hero.images.map((img, i) => (
             <HomeMediaPicture
               key={i}
               section="hero"
               image={img}
               lang={lang}
               fetchPriority={i === 0 ? "high" : "auto"}
               className={styles.heroImage}
               sizes="33vw"
             />
          ))}
        </div>
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <p className={styles.heroEyebrow}>{homeContent.hero.smallTitle[lang]}</p>
          <h1 className={styles.heroTitle}>
            {homeContent.hero.largeTitle[lang].split("\n").map((line, i) => (
              <span key={i}>
                {line}
                {i === 0 && <br />}
              </span>
            ))}
          </h1>
          <p className={styles.heroSubtitle}>{homeContent.hero.subtitle[lang]}</p>
        </div>
      </section>
      {/* 3. Éditorial */}
      <section className={styles.editorial}>
        <div className={styles.editorialInner}>
          <div className={styles.editorialDivider} />
          <p className={styles.editorialText}>
            {homeContent.editorial.paragraph[lang]}{" "}
            <em className={styles.editorialEm}>{homeContent.editorial.highlight[lang]}</em>
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
              <div className={styles.portfolioCardBg}>
                <HomeMediaPicture
                  section="portfolio-photo"
                  image={{ ...homeContent.portfolioCards.photo, alt: { fr: "", en: "" } }}
                  lang={lang}
                  className={styles.heroImage}
                  sizes="(max-width: 720px) 100vw, 50vw"
                />
              </div>
              <div className={styles.portfolioCardOverlay} />
              <div className={styles.portfolioCardContent}>
                <h3 className={styles.portfolioCardTitle}>{homeContent.portfolioCards.photo.title[lang]}</h3>
                <small className={styles.portfolioCardSub}>{homeContent.portfolioCards.photo.subtitle[lang]}</small>
              </div>
            </Link>
            <Link
              to={lang === "fr" ? "/fr/portfolio" : "/en/portfolio"}
              className={`${styles.portfolioCard} ${styles.portfolioCardFilm}`}
            >
              <div className={styles.portfolioCardBg}>
                <HomeMediaPicture
                  section="portfolio-video"
                  image={{ ...homeContent.portfolioCards.video, alt: { fr: "", en: "" } }}
                  lang={lang}
                  className={styles.heroImage}
                  sizes="(max-width: 720px) 100vw, 50vw"
                />
              </div>
              <div className={styles.portfolioCardOverlay} />
              <div className={styles.portfolioCardContent}>
                <h3 className={styles.portfolioCardTitle}>{homeContent.portfolioCards.video.title[lang]}</h3>
                <small className={styles.portfolioCardSub}>{homeContent.portfolioCards.video.subtitle[lang]}</small>
              </div>
            </Link>
          </div>
        </div>
      </section>
      {/* 5. Formules preview */}
      <section className={styles.formulesSection}>
        <div className={styles.formulesInner}>
          <p className={styles.formulesTitle}>{homeContent.pricingPreview.sectionTitle[lang]}</p>
          <div className={styles.formuleTabs}>
            {activeCategories.map((cat) => (
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
                <div className={styles.formuleName}>{tier.name[lang]}</div>
                <div className={styles.formulePrice}>
                  {formatPrice(tier.priceCents, lang)}
                </div>
                <div className={styles.formuleNote}>
                  {tier.summary[lang]}
                </div>
              </div>
            ))}
          </div>
          <p className={styles.formulesPromo}>
            {homeContent.pricingPreview.promoText[lang]}
            <b className={styles.formulesPromoHighlight}>{homeContent.pricingPreview.promoTextBold[lang]}</b>
          </p>
          <p className={styles.formulesCaveat}>{homeContent.pricingPreview.caveat[lang]}</p>
          <div className={styles.formulesContactWrap}>
            <Link
              to={lang === "fr" ? "/fr/contact" : "/en/contact"}
              className="btn btn--outline"
            >
              {homeContent.pricingPreview.buttonText[lang]}
            </Link>
          </div>
          <p className={styles.formulesCustom}>
            {homeContent.pricingPreview.customFormulaText[lang]}{" "}
            <em className={styles.formulesCustomEm}>{homeContent.pricingPreview.customFormulaTextEm[lang]}</em>
          </p>
        </div>
      </section>
      {/* 6. Studio duo */}
      <section className={styles.studioSection}>
        <div className={styles.studioInner}>
          <div className={styles.studioGrid}>
            <div className={`${styles.studioImagePlaceholder} ${styles.studioImageWrapper}`}>
              <HomeMediaPicture
                section="studio"
                image={{ ...homeContent.studio, alt: homeContent.studio.title }}
                lang={lang}
                className={styles.heroImage}
                sizes="(max-width: 720px) 100vw, 50vw"
              />
            </div>
            <div className={styles.studioTitle}>
              {homeContent.studio.title[lang]}
              <small className={`${styles.studioText} ${styles.studioTextFormatted}`}>{homeContent.studio.description[lang]}</small>
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
function HomeMediaPicture({ section, image, fetchPriority, className, sizes, lang }: { section: string, image: HomeImageMetadata, fetchPriority?: "high" | "auto" | "low", className?: string, sizes: string, lang: Lang }) {
  if (!image || !image.imageId || !image.variants || image.variants.length === 0) return null;
  const avifSrcSet = image.variants.map(v => `/media/home/${section}/${image.imageId}/${v.name}/avif ${v.width}w`).join(', ');
  const webpSrcSet = image.variants.map(v => `/media/home/${section}/${image.imageId}/${v.name}/webp ${v.width}w`).join(', ');
  const fallbackVariant = image.variants.find(v => v.name === "960p") || image.variants[0];
  return (
    <picture>
      <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />
      <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} />
      <img
        src={`/media/home/${section}/${image.imageId}/${fallbackVariant.name}/webp`}
        alt={image.alt[lang] || ""}
        width={image.width || 960}
        height={image.height || 1440}
        loading={fetchPriority === "high" ? "eager" : "lazy"}
        fetchPriority={fetchPriority}
        className={className}
      />
    </picture>
  );
}
