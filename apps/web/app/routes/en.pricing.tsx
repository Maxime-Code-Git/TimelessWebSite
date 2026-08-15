import type { Route } from "./+types/en.pricing";
import { useState } from "react";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./formules.module.css";
import type { Category } from "@timeless/shared";

export async function loader() {
  return { siteUrl: process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "" };
}

export function meta(args: Route.MetaArgs) {
  const data = (args as any).data || (args as any).loaderData;
  const base = data?.siteUrl ?? "";
  return [
    { title: "Packages & Pricing — Timeless" },
    { name: "description", content: "A single studio for your photo and film: a unified vision, from the first meeting to delivery." },
    ...(base ? [
      { tagName: "link" as const, rel: "canonical", href: `${base}/en/pricing` },
      { tagName: "link" as const, rel: "alternate", hrefLang: "fr", href: `${base}/fr/formules` },
      { tagName: "link" as const, rel: "alternate", hrefLang: "en", href: `${base}/en/pricing` },
    ] : []),
  ];
}

const PRICING = {
  photo: [
    { name: 'Essential', tagline: 'Key moments, in images.', features: ["6h coverage", "200 photos delivered", "Private online gallery", "Delivery in 6 weeks"] },
    { name: 'Signature', tagline: 'Complete photo coverage of the day.', features: ["8h coverage", "400 photos delivered", "Private online gallery", "Delivery in 4 weeks", "20 fine art prints included"] },
    { name: 'Prestige', tagline: 'Full reportage + fine art album.', features: ["Full day (12h)", "600+ photos delivered", "Private online gallery", "Delivery in 2 weeks", "Bound photo album included", "Free couple session"] }
  ],
  film: [
    { name: 'Essential', tagline: "A short film, condensed emotion.", features: ["Short film (3-4 min)", "Ceremony capture", "Royalty-free music", "Delivery in 6 weeks"] },
    { name: 'Signature', tagline: 'The complete film of your day.', features: ["Full film (8-10 min)", "Ceremony + reception capture", "Social media teaser included", "Delivery in 4 weeks"] },
    { name: 'Prestige', tagline: 'Feature film + teaser + raw footage.', features: ["Feature film (15-20 min)", "Full day capture", "Teaser + raw footage provided", "Drone included (subject to location)", "Delivery in 2 weeks"] }
  ],
  duo: [
    { name: 'Essential', tagline: "Photo and film, the essentials combined.", features: ["6h coverage", "200 photos + short film", "Private online gallery", "Delivery in 6 weeks"] },
    { name: 'Signature', tagline: 'Photo + film, complete coverage.', features: ["8h coverage", "400 photos + full film", "Private online gallery", "Social media teaser included", "Delivery in 4 weeks"] },
    { name: 'Prestige', tagline: "The full experience, without compromise.", features: ["Full day", "600+ photos + feature film", "Bound photo album included", "Drone included (subject to location)", "Delivery in 2 weeks"] }
  ]
};

const LABELS: Record<Category, string> = { photo: 'Photography', film: 'Film', duo: 'Photo & Film' };
const CATEGORIES: Category[] = ['photo', 'film', 'duo'];

const FAQS = [
  { question: 'Are travel expenses included?', answer: "Travel is included within a reference radius around our studio; beyond that, a travel fee is added to the quote." },
  { question: 'What deposit is required to book the date?', answer: "A booking deposit is required upon signing, with the balance paid before the event according to an agreed schedule." },
  { question: 'What are the delivery times?', answer: "Delivery times vary depending on the chosen package, indicated in each card above; a first selection of images is shared well before final delivery." },
  { question: 'Can a package be customized?', answer: "Yes, each package can be adjusted — extra hours, second photographer, additional album — upon request." }
];

export default function PricingEn() {
  const [cat, setCat] = useState<Category>('duo');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className={styles.container}>
      <Header lang="en" alternateLangHref="/fr/formules" />

      <main>
        {/* ── Hero ────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.heroDivider}></div>
          <h1 className={styles.heroTitle}>Our Packages</h1>
          <p className={styles.heroText}>A single studio for your photo and film: a unified vision, from the first meeting to delivery.</p>
        </section>

        {/* ── Pricing ─────────────────────────────────────── */}
        <section className={styles.pricingSection}>
          <div className={styles.pricingWrapper}>
            <div className={styles.categoryTabs} role="tablist" aria-label="Package categories">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  role="tab"
                  aria-selected={cat === c}
                  aria-controls={`panel-${c}`}
                  id={`tab-${c}`}
                  onClick={() => setCat(c)}
                  className={`${styles.tabBtn} ${cat === c ? styles.tabBtnActive : ''}`}
                >
                  {LABELS[c]}
                </button>
              ))}
            </div>

            <div 
              id={`panel-${cat}`}
              role="tabpanel" 
              aria-labelledby={`tab-${cat}`}
              className={styles.cards}
            >
              {PRICING[cat].map((t, i) => {
                const featured = i === 1;
                return (
                  <div key={t.name} className={`${styles.card} ${featured ? styles.cardFeat : ''}`}>
                    {featured && <span className={styles.featBadge}>Most Popular</span>}
                    <h2 className={styles.cardName}>{t.name}</h2>
                    <p className={styles.cardTagline}>{t.tagline}</p>
                    <div className={styles.cardDivider}></div>
                    <ul className={styles.featureList} aria-label={`Features of the ${t.name} package`}>
                      {t.features.map((feat, idx) => (
                        <li key={idx} className={styles.featureItem}>
                          <span className={styles.featureDash} aria-hidden="true">—</span>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <p className={styles.pricingFooterText}>
              Photo and film united under one studio: <strong style={{color: 'var(--gold-light)', fontWeight: 500}}>a consistency — and a price — impossible to get with two separate vendors.</strong>
            </p>
            <p className={styles.pricingFooterSub}>* Photos and videos kept and available for 24 months</p>
          </div>
        </section>

        {/* ── Custom ──────────────────────────────────────── */}
        <section className={styles.customSection}>
          <p className={styles.customSubtitle}>Custom-made</p>
          <h2 className={styles.customTitle}>A very large project, a multi-day wedding, special requests?</h2>
          <p className={styles.customText}>Let's create a package tailored to your event together.</p>
          <a href="/en/contact" className={styles.customBtn}>Request a custom quote</a>
        </section>

        {/* ── FAQ ─────────────────────────────────────────── */}
        <section className={styles.faqSection}>
          <div className={styles.faqWrapper}>
            <h2 className={styles.faqTitle}>Frequently Asked Questions</h2>
            <div className={styles.faqList}>
              {FAQS.map((faq, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={idx} className={styles.faqItem}>
                    <button
                      className={styles.faqQuestionBtn}
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${idx}`}
                    >
                      <span>{faq.question}</span>
                      <span className={styles.faqIcon} aria-hidden="true">{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && (
                      <p id={`faq-answer-${idx}`} className={styles.faqAnswer}>
                        {faq.answer}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <Footer lang="en" />
      <ScrollTop />
    </div>
  );
}
