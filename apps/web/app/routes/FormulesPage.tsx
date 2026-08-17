import { useState } from "react";
import { Link } from "react-router";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";
import { getStrings } from "~/lib/i18n";
import { PRICING, formatPrice } from "~/lib/pricing";
import type { FormulaCategory } from "~/lib/pricing";
import styles from "./formules.module.css";

interface FormulesPageProps {
  lang: Lang;
}

export function FormulesPage({ lang }: FormulesPageProps) {
  const i18n = getStrings(lang);
  const t = i18n.formules;
  const fFeat = i18n.formuleFeatures;
  const [selectedCat, setSelectedCat] = useState<FormulaCategory>("duo");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const alternateLangHref = lang === "fr" ? "/en/pricing" : "/fr/formules";
  const contactHref = lang === "fr" ? "/fr/contact" : "/en/contact";

  const categories: FormulaCategory[] = ["photo", "film", "duo"];
  const currentPricing = PRICING[selectedCat];
  const currentFeatures = fFeat[selectedCat];

  return (
    <>
      <Header lang={lang} alternateLangHref={alternateLangHref} />

      <main id="main-content">
      {/* Title Section */}
      <section className={styles.titleSection}>
        <div className={styles.titleDivider} />
        <h1 className={styles.title}>{t.title}</h1>
        <p className={styles.subtitle}>{t.subtitle}</p>
      </section>

      {/* Cards Section */}
      <section className={styles.cardsSection}>
        <div className={styles.cardsInner}>
          <div className={styles.tabs}>
            {categories.map((cat) => (
              <button
                type="button"
                key={cat}
                onClick={() => setSelectedCat(cat)}
                className={`${styles.tabBtn} ${
                  selectedCat === cat ? styles.active : ""
                }`}
              >
                {t.categoryLabels[cat]}
              </button>
            ))}
          </div>

          <div className={styles.cards}>
            {currentPricing.map((tier, index) => {
              const features = currentFeatures[index] || [];
              return (
                <div
                  key={tier.id}
                  className={`${styles.card} ${
                    tier.featured ? styles.featured : ""
                  }`}
                >
                  {tier.featured && (
                    <span className={styles.featuredBadge}>{t.featuredBadge}</span>
                  )}
                  <div className={styles.cardHeader}>
                    <div className={styles.cardName}>{getStrings(lang).tierNames[tier.id]}</div>
                    <div className={styles.cardPrice}>
                      {formatPrice(tier.priceCents, lang)}
                    </div>
                  </div>
                  <div className={styles.cardDivider} />
                  <ul className={styles.featuresList}>
                    {features.map((feat, i) => (
                      <li key={i} className={styles.featureItem}>
                        <span className={styles.featureDash}>—</span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <p className={styles.promo}>
            {t.promo}
            <b className={styles.promoBold}>{t.promoBold}</b>
          </p>
          <p className={styles.caveat}>{t.caveat}</p>
        </div>
      </section>

      {/* Custom Section */}
      <section className={styles.customSection}>
        <p className={styles.customEyebrow}>{t.customEyebrow}</p>
        <h2 className={styles.customTitle}>{t.customTitle}</h2>
        <p className={styles.customText}>{t.customText}</p>
        <Link to={contactHref} className="btn btn--outline">
          {t.customCta}
        </Link>
      </section>

      {/* FAQ Section */}
      <section className={styles.faqSection}>
        <div className={styles.faqInner}>
          <p className={styles.faqTitle}>{t.faqTitle}</p>
          <div className={styles.faqList}>
            {t.faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className={styles.faqItem}>
                  <button
                    className={styles.faqBtn}
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                  >
                    <span>{faq.question}</span>
                    <span className={styles.faqIcon}>{isOpen ? "−" : "+"}</span>
                  </button>
                  {isOpen && (
                    <p className={styles.faqAnswer}>{faq.answer}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
      </main>

      <Footer lang={lang} />
    </>
  );
}
