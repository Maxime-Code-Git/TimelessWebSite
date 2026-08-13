import type { Route } from "./+types/en.portfolio";
import { useState } from "react";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./portfolio.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Photography Portfolio — Timeless" },
    { name: "description", content: "A sincere look at your moments, captured as they are lived." },
    { tagName: "link", rel: "canonical", href: "https://timeless.be/en/portfolio" },
    { tagName: "link", rel: "alternate", hrefLang: "fr", href: "https://timeless.be/fr/portfolio" },
    { tagName: "link", rel: "alternate", hrefLang: "en", href: "https://timeless.be/en/portfolio" },
  ];
}

const ALL_PHOTOS = [
  { id: 'ph-01', ar: '3x4', cat: 'ceremony', label: 'Ceremony' },
  { id: 'ph-02', ar: '3x4', cat: 'portraits', label: 'Portraits' },
  { id: 'ph-03', ar: '4x3', cat: 'reception', label: 'Reception' },
  { id: 'ph-04', ar: '3x4', cat: 'ceremony', label: 'Ceremony' },
  { id: 'ph-05', ar: '3x4', cat: 'portraits', label: 'Portraits' },
  { id: 'ph-06', ar: '4x3', cat: 'reception', label: 'Reception' },
  { id: 'ph-07', ar: '3x4', cat: 'ceremony', label: 'Ceremony' },
  { id: 'ph-08', ar: '3x4', cat: 'reception', label: 'Reception' },
  { id: 'ph-09', ar: '4x3', cat: 'portraits', label: 'Portraits' }
] as const;

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'ceremony', label: 'Ceremony' },
  { key: 'portraits', label: 'Portraits' },
  { key: 'reception', label: 'Reception' }
] as const;

export default function PortfolioEn() {
  const [filter, setFilter] = useState<string>("all");
  const [playing, setPlaying] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const photos = ALL_PHOTOS.filter(p => filter === "all" || p.cat === filter);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setLightboxImg(null);
  };

  return (
    <div className={styles.container} onKeyDown={handleKeyDown}>
      <Header lang="en" alternateLangHref="/fr/portfolio" />

      <main>
        {/* ── Hero ────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.heroDivider}></div>
          <h1 className={styles.heroTitle}>Photography</h1>
          <p className={styles.heroText}>A sincere look at your moments, captured as they are lived.</p>
          <div className={styles.heroLinks}>
            <a href="#galerie-photo" className={styles.heroBtnActive}>Photo</a>
            <a href="#galerie-video" className={styles.heroBtn}>Video</a>
          </div>
        </section>

        {/* ── Filters ─────────────────────────────────────── */}
        <section className={styles.filtersSection}>
          <div className={styles.filters} role="group" aria-label="Portfolio filters">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`${styles.filterBtn} ${filter === f.key ? styles.filterBtnActive : ''}`}
                aria-pressed={filter === f.key}
              >
                {f.label}
              </button>
            ))}
          </div>
        </section>

        {/* ── Gallery Grid ────────────────────────────────── */}
        <section id="galerie-photo" className={styles.gallerySection}>
          <div className={styles.galleryWrapper}>
            <div className={styles.gallery}>
              {photos.map(p => (
                <div key={p.id} className={`${styles.photoWrap} ${p.ar === '4x3' ? styles.photoWrap4x3 : styles.photoWrap3x4}`}>
                  <button 
                    className={styles.photoBtn}
                    onClick={() => setLightboxImg(p.label)}
                    aria-label={`Enlarge photo of category ${p.label}`}
                  >
                    <div className={styles.photoPlaceholder}>{p.label} (Placeholder)</div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Video Section ───────────────────────────────── */}
        <section id="galerie-video" className={styles.videoSection}>
          <p className={styles.videoSubtitle}>And in motion</p>
          <h2 className={styles.videoTitle}>Discover the film of your day.</h2>
          
          <div className={styles.videoWrapper}>
            {playing ? (
              <video autoPlay controls style={{width: '100%', height: '100%'}}>
              </video>
            ) : (
              <>
                <div className={styles.videoPoster}>
                  <div className={styles.videoPosterPlaceholder}>Film excerpt (Placeholder)</div>
                </div>
                <button 
                  onClick={() => setPlaying(true)}
                  className={styles.playBtn}
                  aria-label="Play video"
                >
                  ►
                </button>
              </>
            )}
          </div>

          <a href="#" className={styles.allFilmsLink}>See all films</a>
        </section>
      </main>

      <Footer lang="en" />
      <ScrollTop />

      {/* Lightbox */}
      {lightboxImg && (
        <div 
          className={styles.lightbox}
          role="dialog"
          aria-label="Image viewer"
          aria-modal="true"
          onClick={() => setLightboxImg(null)}
        >
          <button 
            className={styles.lightboxClose}
            onClick={() => setLightboxImg(null)}
            aria-label="Close viewer"
            autoFocus
          >
            ×
          </button>
          <div style={{color: 'white', fontSize: '24px'}}>{lightboxImg} (Lightbox Placeholder)</div>
        </div>
      )}
    </div>
  );
}
