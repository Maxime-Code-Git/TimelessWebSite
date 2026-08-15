import type { Route } from "./+types/en._index";
import { useState } from "react";
import { Link } from "react-router";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./fr._index.module.css";

// SSR loader — will fetch real formules from DB in Phase 3
export async function loader(_args: Route.LoaderArgs) {
  const siteUrl = process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  // Placeholder data — matches maquette content exactly
  // In Phase 3: fetch from SQLite via API
  const FORMULES = {
    photo: [
      { name: "Essential", note: "The key moments,<br>in images.", featured: false },
      { name: "Signature", note: "Full photo<br>coverage of the day.", featured: true },
      { name: "Prestige", note: "Full report<br>+ art album.", featured: false },
    ],
    film: [
      { name: "Essential", note: "A short film,<br>emotion condensed.", featured: false },
      { name: "Signature", note: "The complete film<br>of your day.", featured: true },
      { name: "Prestige", note: "Feature film<br>+ teaser + rushes.", featured: false },
    ],
    duo: [
      { name: "Essential", note: "Photo and film,<br>the essentials united.", featured: false },
      { name: "Signature", note: "Photo + film,<br>complete coverage.", featured: true },
      { name: "Prestige", note: "The full experience,<br>without compromise.", featured: false },
    ],
  };
  return { formules: FORMULES, siteUrl };
}

type Cat = "photo" | "film" | "duo";

export function meta(args: Route.MetaArgs) {
  const data = (args as any).data || (args as any).loaderData;
  const base = data?.siteUrl ?? "";
  return [
    { title: "Timeless — Wedding Photographer & Videographer in Belgium" },
    {
      name: "description",
      content:
        "Premium wedding photography and videography studio in Belgium. Two perspectives, one studio — stop time, keep the emotion.",
    },
    { property: "og:title", content: "Timeless — Wedding Photo & Video" },
    {
      property: "og:description",
      content: "Wedding photography and videography studio in Belgium. One studio for your film and your photos.",
    },
    { property: "og:type", content: "website" },
    { property: "og:locale", content: "en_BE" },
    { property: "og:locale:alternate", content: "fr_BE" },
    ...(base ? [
      { tagName: "link" as const, rel: "canonical", href: `${base}/en/` },
      { tagName: "link" as const, rel: "alternate", hrefLang: "en", href: `${base}/en/` },
      { tagName: "link" as const, rel: "alternate", hrefLang: "fr", href: `${base}/fr/` },
      { tagName: "link" as const, rel: "alternate", hrefLang: "x-default", href: `${base}/fr/` },
    ] : []),
  ];
}

export default function HomePageEn({ loaderData }: Route.ComponentProps) {
  const { formules } = loaderData;
  const [cat, setCat] = useState<Cat>("duo");

  const LABELS: Record<Cat, string> = {
    photo: "Photography",
    film: "Film",
    duo: "Photo & Film",
  };

  const currentFormules = formules[cat];

  return (
    <div className={styles.container}>
      <Header lang="en" variant="home" alternateLangHref="/fr/" />

      <main id="main-content">
        {/* ── Hero ─────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.heroBg}>
            <div className={styles.heroPlaceholder}>Wedding film opening</div>
          </div>
          <div className={styles.heroOverlay}></div>
          <div className={styles.heroContent}>
            <div className={styles.heroDivider}></div>
            <h1 className={styles.heroTitle}>Stop time,<br />make the day eternal.</h1>
            <p className={styles.heroText}>Belgium's premium wedding photo &amp; film studio.</p>
            <Link to="/en/contact" className={styles.heroBtn}>
              Tell us your story
            </Link>
          </div>
        </section>

        {/* ── Identity ──────────────────────────────────── */}
        <section className={styles.identitySection}>
          <div className={styles.identityWrapper}>
            <div className={styles.identityDivider}></div>
            <h2 className={styles.identityTitle}>Two perspectives,<br />one studio.</h2>
            <p className={styles.identityText}>Photo and film conceived together — one vision, from the first meeting to delivery. Nothing missed, nothing out of place.</p>
          </div>
        </section>

        {/* ── Portfolio ─────────────────────────────────── */}
        <section className={styles.portfolioSection}>
          <div className={styles.portfolioWrapper}>
            <p className={styles.portfolioSubtitle}>Portfolio</p>
            <h2 className={styles.portfolioTitle}>A sincere look at your moments.</h2>
            <div className={styles.portfolioGrid}>
              <div className={`${styles.portfolioItem} ${styles.pItem1}`}>
                <div className={styles.portfolioPlaceholder}>Wedding photo 1</div>
              </div>
              <div className={`${styles.portfolioItem} ${styles.pItem2}`}>
                <div className={styles.portfolioPlaceholder}>Wedding photo 2</div>
              </div>
              <div className={`${styles.portfolioItem} ${styles.pItem3}`}>
                <div className={styles.portfolioPlaceholder}>Wedding photo 3</div>
              </div>
              <div className={`${styles.portfolioItem} ${styles.pItem4}`}>
                <div className={styles.portfolioPlaceholder}>Wedding photo 4</div>
              </div>
            </div>
            <Link to="/en/portfolio" className={styles.portfolioBtn}>
              View the full portfolio
            </Link>
          </div>
        </section>

        {/* ── Packages ──────────────────────────────────── */}
        <section className={styles.formulesSection}>
          <div className={styles.formulesWrapper}>
            <p className={styles.formulesSubtitle}>Packages</p>
            <h2 className={styles.formulesTitle}>Find the coverage<br />that fits your day.</h2>

            {/* Tabs */}
            <div className={styles.formulesTabsOuter}>
              <div className={styles.formulesTabsWrapper}>
                <div className={styles.formulesTabs} role="tablist">
                  {(["photo", "film", "duo"] as Cat[]).map((c) => (
                    <button
                      key={c}
                      role="tab"
                      aria-selected={cat === c}
                      id={`tab-en-${c}`}
                      className={`${styles.formulesTab} ${cat === c ? styles.formulesTabActive : ""}`}
                      onClick={() => setCat(c)}
                    >
                      {LABELS[c]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Cards */}
            <div className={styles.formulesGrid} role="tabpanel" aria-labelledby={`tab-en-${cat}`}>
              {currentFormules.map((f) => (
                <div key={f.name} className={`${styles.formulesCard} ${f.featured ? styles.formulesCardFeatured : ""}`}>
                  {f.featured && <div className={styles.formulesCardBadge}>Most popular</div>}
                  <div className={styles.formulesCardDivider}></div>
                  <h3 className={styles.formulesCardName}>{f.name}</h3>
                  <p className={styles.formulesCardNote} dangerouslySetInnerHTML={{ __html: f.note }}></p>
                  <Link
                    to="/en/contact"
                    className={`${styles.formulesCardBtn} ${f.featured ? styles.formulesCardBtnFeatured : ""}`}
                  >
                    Book now
                  </Link>
                </div>
              ))}
            </div>

            <p className={styles.formulesNote}>
              <Link to="/en/pricing" className={styles.formulesNoteLink}>
                Full packages & pricing →
              </Link>
            </p>
          </div>
        </section>

        {/* ── Testimonials ──────────────────────────────── */}
        <section className={styles.testiSection}>
          <div className={styles.testiWrapper}>
            <p className={styles.testiSubtitle}>What they say</p>
            <div className={styles.testiGrid}>
              <div className={styles.testiCard}>
                <p className={styles.testiDivider}></p>
                <p className={styles.testiText}>"From the very first contact, we felt understood. The photos are exactly what we dreamed of."</p>
                <p className={styles.testiAuthor}>— A couple</p>
              </div>
              <div className={styles.testiCard}>
                <p className={styles.testiDivider}></p>
                <p className={styles.testiText}>"Every time we watch the film, we relive the entire day. An exceptional piece of work."</p>
                <p className={styles.testiAuthor}>— Another couple</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────── */}
        <section className={styles.ctaSection}>
          <div className={styles.ctaWrapper}>
            <div className={styles.ctaDivider}></div>
            <h2 className={styles.ctaTitle}>Tell us your story.</h2>
            <p className={styles.ctaText}>A free 30-minute discovery call, without obligation.<br />To get to know each other and talk about your wedding.</p>
            <Link to="/en/contact" className={styles.ctaBtn}>
              Contact us
            </Link>
          </div>
        </section>
      </main>

      <Footer lang="en" />
      <ScrollTop />
    </div>
  );
}
