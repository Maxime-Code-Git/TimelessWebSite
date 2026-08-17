import { useState } from "react";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";
import { getStrings } from "~/lib/i18n";
import styles from "./portfolio.module.css";

interface PortfolioPageProps {
  lang: Lang;
}

// Temporary data for photos
const ALL_PHOTOS = [
  { id: "ph-01", ar: "3/4", cat: "ceremony", labelFR: "Cérémonie", labelEN: "Ceremony" },
  { id: "ph-02", ar: "3/4", cat: "portraits", labelFR: "Portraits", labelEN: "Portraits" },
  { id: "ph-03", ar: "4/3", cat: "reception", labelFR: "Réception", labelEN: "Reception" },
  { id: "ph-04", ar: "3/4", cat: "ceremony", labelFR: "Cérémonie", labelEN: "Ceremony" },
  { id: "ph-05", ar: "3/4", cat: "portraits", labelFR: "Portraits", labelEN: "Portraits" },
  { id: "ph-06", ar: "4/3", cat: "reception", labelFR: "Réception", labelEN: "Reception" },
  { id: "ph-07", ar: "3/4", cat: "ceremony", labelFR: "Cérémonie", labelEN: "Ceremony" },
  { id: "ph-08", ar: "3/4", cat: "reception", labelFR: "Réception", labelEN: "Reception" },
  { id: "ph-09", ar: "4/3", cat: "portraits", labelFR: "Portraits", labelEN: "Portraits" },
];

export function PortfolioPage({ lang }: PortfolioPageProps) {
  const t = getStrings(lang).portfolio;
  const [activeFilter, setActiveFilter] = useState("all");
  const [videoPlaying, setVideoPlaying] = useState(false);

  const alternateLangHref = lang === "fr" ? "/en/portfolio" : "/fr/portfolio";

  const filters = [
    { key: "all", label: t.filterAll },
    { key: "ceremony", label: t.filterCeremony },
    { key: "portraits", label: t.filterPortraits },
    { key: "reception", label: t.filterReception },
  ];

  const visiblePhotos = ALL_PHOTOS.filter(
    (p) => activeFilter === "all" || p.cat === activeFilter
  );

  return (
    <>
      <Header lang={lang} alternateLangHref={alternateLangHref} />

      {/* Title Section */}
      <section className={styles.titleSection}>
        <div className={styles.titleDivider} />
        <h1 className={styles.title}>{t.title}</h1>
        <p className={styles.subtitle}>{t.subtitle}</p>
        <div className={styles.tabs}>
          <a href="#galerie-photo" className={`${styles.tabBtn} ${styles.active}`}>
            {t.tabPhoto}
          </a>
          <a href="#galerie-video" className={styles.tabBtn}>
            {t.tabVideo}
          </a>
        </div>
      </section>

      {/* Filters */}
      <section className={styles.filtersSection}>
        <div className={styles.filters}>
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`${styles.filterBtn} ${
                activeFilter === f.key ? styles.active : ""
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {/* Photo Gallery */}
      <section id="galerie-photo" className={styles.photoSection}>
        <div className={styles.photoInner}>
          <div className={styles.photoGrid}>
            {visiblePhotos.map((photo) => {
              const spanClass = photo.ar === "4/3" ? styles.span2 : styles.span1;
              const label = lang === "fr" ? photo.labelFR : photo.labelEN;
              return (
                <div key={photo.id} className={`${styles.photoWrap} ${spanClass}`}>
                  <div className={styles.photoSlot}>{label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Video Section */}
      <section id="galerie-video" className={styles.videoSection}>
        <p className={styles.videoEyebrow}>{t.videoEyebrow}</p>
        <h2 className={styles.videoTitle}>{t.videoTitle}</h2>
        
        <div className={styles.videoPlayerWrap}>
          {videoPlaying ? (
            <video
              autoPlay
              controls
              muted
              playsInline
              className={styles.videoElement}
            />
          ) : (
            <>
              <div className={styles.videoPoster}>
                {lang === "fr" ? "Extrait du film (horizontal)" : "Film excerpt (horizontal)"}
              </div>
              <button
                className={styles.videoPlayBtn}
                onClick={() => setVideoPlaying(true)}
                aria-label="Play video"
              >
                ►
              </button>
            </>
          )}
        </div>
        
        <a href="#galerie-video" className={styles.videoSeeAll}>
          {t.videoSeeAll}
        </a>
      </section>

      <Footer lang={lang} />
    </>
  );
}
