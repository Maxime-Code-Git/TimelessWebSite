import { Link } from "react-router";
import type { Lang } from "~/lib/i18n";
import styles from "./gallery.module.css";

export interface GalleryChapter {
  id: string;
  titleFR?: string;
  titleEN?: string;
  title?: string;
  count: number;
  photos: Array<{ id: string; aspect: string; span: string }>;
}

export interface GalleryPageProps {
  lang: Lang;
  galleryName: string;
  date: string;
  location: string;
  intro: string;
  signature: string;
  chapters: GalleryChapter[];
}

export function GalleryPage({
  lang,
  galleryName,
  date,
  location,
  intro,
  signature,
  chapters,
}: GalleryPageProps) {
  const altLangLabel = lang === "fr" ? "EN" : "FR";
  const curLangLabel = lang === "fr" ? "FR" : "EN";

  return (
    <div className={styles.galleryWrap}>
      {/* Minimal Header */}
      <header className={styles.galleryHeader}>
        <Link to={lang === "fr" ? "/fr/" : "/en/"} aria-label="Retour à l'accueil">
          <img src="/brand/sempra_horizontal_navy.svg" alt="Sempra" className={styles.logo} />
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
          <p className={styles.date}>{date}</p>
          <h1 className={styles.title}>{galleryName}</h1>
          <p className={styles.location}>{location}</p>
        </div>
      </section>

      {/* Content Area */}
      <main className={styles.contentArea}>
        <div className={styles.introMsg}>
          <div className={styles.introDivider} />
          <p className={styles.introText}>{intro}</p>
          <p className={styles.introSignature}>{signature}</p>
        </div>

        {chapters.map((chapter) => (
          <div key={chapter.id} className={styles.chapter}>
            <h2 className={styles.chapterTitle}>
              {chapter.title || (lang === "fr" ? chapter.titleFR : chapter.titleEN)}
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
        <img src="/brand/sempra_horizontal_navy.svg" alt="Sempra" className={styles.footerLogo} />
        <p>&copy; {new Date().getFullYear()} Sempra. {lang === "fr" ? "Tous droits réservés." : "All rights reserved."}</p>
      </footer>
    </div>
  );
}
