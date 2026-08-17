import { Link } from "react-router";
import type { Lang } from "~/lib/i18n";
import styles from "./gallery.module.css";

interface GalleryPageProps {
  lang: Lang;
}

// ── Dummy Fixtures ───────────────────────────────────────
const FIXTURES = {
  galleryName: "Camille & Antoine",
  dateFR: "12 Septembre 2026",
  dateEN: "September 12, 2026",
  location: "Château de la Hulpe, Belgique",
  introFR:
    "Chère Camille, cher Antoine,\n\nVoici le récit de votre journée. Nous espérons que ces images vous feront revivre chaque émotion avec la même intensité.",
  introEN:
    "Dear Camille, dear Antoine,\n\nHere is the story of your day. We hope these images will make you relive every emotion with the same intensity.",
  signature: "— L'équipe Timeless",
  chapters: [
    {
      id: "prep",
      titleFR: "Préparatifs",
      titleEN: "Preparations",
      count: 42,
      photos: [
        { id: "p1", aspect: "aspect-4-3", span: "span2" },
        { id: "p2", aspect: "aspect-3-4", span: "" },
        { id: "p3", aspect: "aspect-3-4", span: "" },
      ],
    },
    {
      id: "ceremony",
      titleFR: "Cérémonie",
      titleEN: "Ceremony",
      count: 156,
      photos: [
        { id: "c1", aspect: "aspect-16-9", span: "span2" },
        { id: "c2", aspect: "aspect-3-4", span: "" },
        { id: "c3", aspect: "aspect-4-3", span: "span2" },
      ],
    },
  ],
};

export function GalleryPage({ lang }: GalleryPageProps) {
  const altLangLabel = lang === "fr" ? "EN" : "FR";
  const curLangLabel = lang === "fr" ? "FR" : "EN";

  return (
    <div className={styles.galleryWrap}>
      {/* Minimal Header */}
      <header className={styles.galleryHeader}>
        <Link to={lang === "fr" ? "/fr/" : "/en/"} aria-label="Retour à l'accueil">
          <img src="/logo-officiel.png" alt="Timeless" className={styles.logo} />
        </Link>

        <div className={styles.headerActions}>
          <span className={styles.langSwitcher}>
            <span className={styles.langActive}>{curLangLabel}</span>
            <span className={styles.langDot}>·</span>
            {/* Real app will keep the same gallery ID but switch lang parameter */}
            <span className={styles.langInactive}>{altLangLabel}</span>
          </span>

          <button className={styles.downloadBtn}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {lang === "fr" ? "Télécharger" : "Download"}
          </button>
        </div>
      </header>

      {/* Cover Section */}
      <section className={styles.coverSection}>
        <div className={styles.coverImagePlaceholder} />
        <div className={styles.coverOverlay} />
        <div className={styles.coverContent}>
          <p className={styles.date}>{lang === "fr" ? FIXTURES.dateFR : FIXTURES.dateEN}</p>
          <h1 className={styles.title}>{FIXTURES.galleryName}</h1>
          <p className={styles.location}>{FIXTURES.location}</p>
        </div>
      </section>

      {/* Content Area */}
      <main className={styles.contentArea}>
        <div className={styles.introMsg}>
          <div className={styles.introDivider} />
          <p className={styles.introText}>
            {lang === "fr" ? FIXTURES.introFR : FIXTURES.introEN}
          </p>
          <p className={styles.introSignature}>{FIXTURES.signature}</p>
        </div>

        {FIXTURES.chapters.map((chapter) => (
          <div key={chapter.id} className={styles.chapter}>
            <h2 className={styles.chapterTitle}>
              {lang === "fr" ? chapter.titleFR : chapter.titleEN}
            </h2>
            <p className={styles.chapterCount}>
              {chapter.count} {lang === "fr" ? "photos" : "photos"}
            </p>
            
            <div className={styles.photoGrid}>
              {chapter.photos.map((photo) => (
                <div 
                  key={photo.id} 
                  className={`${styles.photoWrap} ${styles[photo.aspect]} ${
                    photo.span ? styles[photo.span] : ""
                  }`}
                >
                  <div className={styles.photoSlot}>
                    {photo.id}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>

      {/* Minimal Footer */}
      <footer className={styles.galleryFooter}>
        <img src="/logo-officiel.png" alt="Timeless" className={styles.footerLogo} />
        <p>&copy; {new Date().getFullYear()} Timeless. {lang === "fr" ? "Tous droits réservés." : "All rights reserved."}</p>
      </footer>
    </div>
  );
}
