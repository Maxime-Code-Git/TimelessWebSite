import type { Route } from "./+types/fr.portfolio";
import { useState } from "react";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./portfolio.module.css";

export async function loader() {
  return { siteUrl: process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "" };
}

export function meta(args: Route.MetaArgs) {
  const data = (args as any).data || (args as any).loaderData;
  const base = data?.siteUrl ?? "";
  return [
    { title: "Portfolio Photographie — Timeless" },
    { name: "description", content: "Un regard sincère sur vos instants, saisis tels qu'ils se vivent." },
    ...(base ? [
      { tagName: "link" as const, rel: "canonical", href: `${base}/fr/portfolio` },
      { tagName: "link" as const, rel: "alternate", hrefLang: "fr", href: `${base}/fr/portfolio` },
      { tagName: "link" as const, rel: "alternate", hrefLang: "en", href: `${base}/en/portfolio` },
    ] : []),
  ];
}

const ALL_PHOTOS = [
  { id: 'ph-01', ar: '3x4', cat: 'ceremonie', label: 'Cérémonie' },
  { id: 'ph-02', ar: '3x4', cat: 'portraits', label: 'Portraits' },
  { id: 'ph-03', ar: '4x3', cat: 'reception', label: 'Réception' },
  { id: 'ph-04', ar: '3x4', cat: 'ceremonie', label: 'Cérémonie' },
  { id: 'ph-05', ar: '3x4', cat: 'portraits', label: 'Portraits' },
  { id: 'ph-06', ar: '4x3', cat: 'reception', label: 'Réception' },
  { id: 'ph-07', ar: '3x4', cat: 'ceremonie', label: 'Cérémonie' },
  { id: 'ph-08', ar: '3x4', cat: 'reception', label: 'Réception' },
  { id: 'ph-09', ar: '4x3', cat: 'portraits', label: 'Portraits' }
] as const;

const FILTERS = [
  { key: 'tout', label: 'Tout' },
  { key: 'ceremonie', label: 'Cérémonie' },
  { key: 'portraits', label: 'Portraits' },
  { key: 'reception', label: 'Réception' }
] as const;

export default function PortfolioFr() {
  const [filter, setFilter] = useState<string>("tout");
  const [playing, setPlaying] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const photos = ALL_PHOTOS.filter(p => filter === "tout" || p.cat === filter);

  // Close lightbox on escape
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setLightboxImg(null);
  };

  return (
    <div className={styles.container} onKeyDown={handleKeyDown}>
      <Header lang="fr" alternateLangHref="/en/portfolio" />

      <main>
        {/* ── Hero ────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.heroDivider}></div>
          <h1 className={styles.heroTitle}>Photographie</h1>
          <p className={styles.heroText}>Un regard sincère sur vos instants, saisis tels qu'ils se vivent.</p>
          <div className={styles.heroLinks}>
            <a href="#galerie-photo" className={styles.heroBtnActive}>Photo</a>
            <a href="#galerie-video" className={styles.heroBtn}>Vidéo</a>
          </div>
        </section>

        {/* ── Filters ─────────────────────────────────────── */}
        <section className={styles.filtersSection}>
          <div className={styles.filters} role="group" aria-label="Filtres du portfolio">
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
                    aria-label={`Agrandir la photo de la catégorie ${p.label}`}
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
          <p className={styles.videoSubtitle}>Et en mouvement</p>
          <h2 className={styles.videoTitle}>Découvrez le film de votre journée.</h2>
          
          <div className={styles.videoWrapper}>
            {playing ? (
              <video autoPlay controls style={{width: '100%', height: '100%'}}>
                {/* No actual video source for now */}
              </video>
            ) : (
              <>
                <div className={styles.videoPoster}>
                  <div className={styles.videoPosterPlaceholder}>Extrait du film (Placeholder)</div>
                </div>
                <button 
                  onClick={() => setPlaying(true)}
                  className={styles.playBtn}
                  aria-label="Lire la vidéo"
                >
                  ►
                </button>
              </>
            )}
          </div>

          <a href="#" className={styles.allFilmsLink}>Voir tous les films</a>
        </section>
      </main>

      <Footer lang="fr" />
      <ScrollTop />

      {/* Lightbox */}
      {lightboxImg && (
        <div 
          className={styles.lightbox}
          role="dialog"
          aria-label="Visionneuse d'image"
          aria-modal="true"
          onClick={() => setLightboxImg(null)}
        >
          <button 
            className={styles.lightboxClose}
            onClick={() => setLightboxImg(null)}
            aria-label="Fermer la visionneuse"
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
