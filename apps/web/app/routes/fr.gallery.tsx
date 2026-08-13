import type { Route } from "./+types/fr.gallery";
import { useState } from "react";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./gallery.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Ma galerie — Timeless" },
    { name: "description", content: "Bienvenue dans votre galerie privée." },
    { tagName: "meta", name: "robots", content: "noindex, nofollow" }, // Private gallery
  ];
}

const ALL_PHOTOS = [
  { id: 'mg-01', ar: '3/4' }, { id: 'mg-02', ar: '3/4' }, { id: 'mg-03', ar: '3/4' }, { id: 'mg-04', ar: '3/4' },
  { id: 'mg-05', ar: '4/3' }, { id: 'mg-06', ar: '4/3' },
  { id: 'mg-07', ar: '3/4' }, { id: 'mg-08', ar: '3/4' }, { id: 'mg-09', ar: '3/4' }, { id: 'mg-10', ar: '3/4' },
  { id: 'mg-11', ar: '4/3' }, { id: 'mg-12', ar: '4/3' },
  { id: 'mg-13', ar: '3/4' }, { id: 'mg-14', ar: '3/4' }, { id: 'mg-15', ar: '3/4' }, { id: 'mg-16', ar: '3/4' },
  { id: 'mg-17', ar: '4/3' }, { id: 'mg-18', ar: '4/3' },
  { id: 'mg-19', ar: '3/4' }, { id: 'mg-20', ar: '3/4' }, { id: 'mg-21', ar: '3/4' }, { id: 'mg-22', ar: '3/4' },
  { id: 'mg-23', ar: '4/3' }, { id: 'mg-24', ar: '4/3' }
];
const INITIAL_COUNT = 12;

export default function GalleryFr() {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);

  const visible = expanded ? ALL_PHOTOS : ALL_PHOTOS.slice(0, INITIAL_COUNT);
  
  const countLabel = `${visible.length} sur ${ALL_PHOTOS.length} photos`;
  const toggleLabel = expanded ? 'Afficher moins' : 'Voir plus';

  return (
    <div className={styles.container}>
      <Header lang="fr" alternateLangHref="/en/gallery" hideNav />

      <main>
        {/* ── Hero ────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.heroBg}>
            <div className={styles.photoPlaceholder}>Photo de couverture du mariage</div>
          </div>
          <div className={styles.heroOverlay}></div>
          <div className={styles.heroContent}>
            <p className={styles.heroSubtitle}>Votre journée</p>
            <h1 className={styles.heroTitle}>Julie & Marc — 14 juin 2025</h1>
            <p className={styles.heroText}>Bienvenue dans votre galerie privée. Merci de nous avoir confié ce si beau jour.</p>
          </div>
        </section>

        {/* ── Shortcuts ───────────────────────────────────── */}
        <section className={styles.shortcutsSection}>
          <div className={styles.shortcutsWrapper}>
            <div className={styles.shortcutsGrid}>
              <a href="#galerie-photo" className={styles.shortcutCard}>
                <span className={styles.shortcutIcon}>▢</span>
                <span className={styles.shortcutTitle}>Voir les photos</span>
              </a>
              <a href="#galerie-video" className={styles.shortcutCard}>
                <span className={`${styles.shortcutIcon} ${styles.shortcutIconVideo}`}>▶</span>
                <span className={styles.shortcutTitle}>Voir le film</span>
              </a>
            </div>

            <div className={styles.downloadsArea}>
              <div className={styles.downloadsList}>
                <button className={styles.btnPrimary} onClick={(e) => e.preventDefault()}>Tout télécharger</button>
                <button className={styles.btnSecondary} onClick={(e) => e.preventDefault()}>Télécharger les photos</button>
                <button className={styles.btnSecondary} onClick={(e) => e.preventDefault()}>Télécharger les vidéos</button>
              </div>
              <p className={styles.downloadsNote}>Archive .zip — pensez à une connexion stable.</p>
            </div>
          </div>
        </section>

        {/* ── Photo Gallery ───────────────────────────────── */}
        <section id="galerie-photo" className={styles.photoSection}>
          <div className={styles.photoWrapper}>
            <h2 className={styles.sectionTitle}>Vos photos</h2>
            <div className={styles.photoGrid}>
              {visible.map((photo, i) => (
                <div key={photo.id} className={`${styles.photoItem} ${photo.ar === '4/3' ? styles.photoItemLandscape : styles.photoItemPortrait}`}>
                  <div className={styles.photoPlaceholder}>Photo {i + 1}</div>
                  <button className={styles.downloadIcon} aria-label="Télécharger cette photo" onClick={(e) => e.preventDefault()}>↓</button>
                </div>
              ))}
            </div>
            
            <div className={styles.loadMoreArea}>
              <button className={styles.loadMoreBtn} onClick={() => setExpanded(!expanded)}>
                {toggleLabel}
              </button>
              <p className={styles.photoCount}>{countLabel}</p>
            </div>
          </div>
        </section>

        {/* ── Video Gallery ───────────────────────────────── */}
        <section id="galerie-video" className={styles.videoSection}>
          <div className={styles.videoWrapper}>
            <h2 className={styles.videoSectionTitle}>Votre film</h2>
            <div className={styles.videoContainer}>
              <button className={styles.videoDownloadBtn} aria-label="Télécharger le film" onClick={(e) => e.preventDefault()} style={{
                width: '34px', height: '34px', borderRadius: '50%', border: '0.5px solid var(--gold-light)', background: 'rgba(7,36,33,0.55)', color: 'var(--bg)', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: 0.6, transition: 'opacity .2s, transform .2s'
              }}>↓</button>
              
              {playing ? (
                <video autoPlay controls muted playsInline className={styles.videoPlayer}>
                  {/* Source would go here */}
                </video>
              ) : (
                <>
                  <div className={styles.videoPlaceholder}>Film du mariage (format cinéma)</div>
                  <button className={styles.playBtn} onClick={() => setPlaying(true)} aria-label="Jouer le film">►</button>
                </>
              )}
            </div>
          </div>
        </section>

        <section className={styles.footerLinkArea}>
          <p className={styles.footerLinkText}>Votre galerie reste disponible 24 mois.</p>
          <a href="/fr/contact" className={styles.footerContactLink}>Un souci ? Contactez-nous</a>
        </section>
      </main>

      <Footer lang="fr" hideNav />
      <ScrollTop />
    </div>
  );
}
