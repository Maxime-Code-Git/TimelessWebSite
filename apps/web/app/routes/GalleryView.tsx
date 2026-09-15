import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";
import styles from "./gallery.module.css";

import { useEffect, useRef, useState, useCallback } from "react";

export interface GalleryMedia {
  id: string;
  type: "photo" | "video";
  width: number | null;
  height: number | null;
  original_name?: string;
}

interface GalleryViewProps {
  lang: Lang;
  gallery: {
    id: string;
    public_id: string;
    bride_names: string;
    wedding_date: string;
    location: string | null;
    intro_fr: string | null;
    intro_en: string | null;
    signature_fr: string | null;
    signature_en: string | null;
    cover_image_id: string | null;
  };
  media: GalleryMedia[];
}

export function GalleryView({ lang, gallery, media }: GalleryViewProps) {
  const t = {
    downloadAll: lang === "fr" ? "Tout télécharger (ZIP)" : "Download all (ZIP)",
    downloadPhotos: lang === "fr" ? "Photos uniquement" : "Photos only",
    downloadVideos: lang === "fr" ? "Vidéos uniquement" : "Videos only",
    photosTitle: lang === "fr" ? "La Galerie" : "The Gallery",
    videosTitle: lang === "fr" ? "Le Film" : "The Film",
    shortcuts: lang === "fr" ? "Raccourcis" : "Shortcuts",
    loadMore: lang === "fr" ? "Charger plus" : "Load more",
    loading: lang === "fr" ? "Chargement..." : "Loading...",
  };

  const alternateLangHref = lang === "fr" ? `/en/gallery/${gallery.public_id}` : `/fr/galerie/${gallery.public_id}`;

  const intro = lang === "fr" ? gallery.intro_fr : gallery.intro_en;
  const signature = lang === "fr" ? gallery.signature_fr : gallery.signature_en;

  const initialPhotos = media.filter(m => m.type === "photo");
  const videos = media.filter(m => m.type === "video");

  const [photos, setPhotos] = useState<GalleryMedia[]>(initialPhotos);
  const [hasMore, setHasMore] = useState(initialPhotos.length === 24);
  const [loading, setLoading] = useState(false);

  const fetchMorePhotos = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/gallery/${gallery.public_id}/photos?skip=${photos.length}`);
      if (res.ok) {
        const data = await res.json();
        setPhotos(prev => [...prev, ...data.photos]);
        setHasMore(data.hasMore);
      }
    } catch (e) {
      console.error("Failed to load more photos", e);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, gallery.public_id, photos.length]);

  const coverUrl = gallery.cover_image_id
    ? `/api/gallery/${gallery.public_id}/media/${gallery.cover_image_id}`
    : `/media/home/hero/hero-2/desktop/webp`;

  return (
    <div className={styles.container}>
      <Header lang={lang} alternateLangHref={alternateLangHref} />

      <section className={styles.hero}>
        <div className={styles.heroBg}>
          <img src={coverUrl} alt="Cover" className={styles.heroImage} />
          <div className={styles.heroOverlay} />
        </div>
        <div className={styles.heroContent}>
          <p className={styles.heroSubtitle}>{gallery.location || "Mariage"}</p>
          <h1 className={styles.heroTitle}>{gallery.bride_names}</h1>
          <p className={styles.heroText}>{gallery.wedding_date}</p>
        </div>
      </section>

      {intro && (
        <section className={`${styles.shortcutsSection} ${styles.introSection}`}>
          <p className={styles.heroText}>{intro}</p>
          {signature && <p className={styles.signatureText}>{signature}</p>}
        </section>
      )}

      <section className={styles.shortcutsSection}>
        <div className={styles.shortcutsWrapper}>
          <div className={styles.downloadsArea}>
            <div className={styles.downloadsList}>
              <a href={`/api/gallery/${gallery.public_id}/download?type=all`} className={styles.btnPrimary}>
                {t.downloadAll}
              </a>
              {photos.length > 0 && videos.length > 0 && (
                <>
                  <a href={`/api/gallery/${gallery.public_id}/download?type=photos`} className={styles.btnSecondary}>
                    {t.downloadPhotos}
                  </a>
                  <a href={`/api/gallery/${gallery.public_id}/download?type=videos`} className={styles.btnSecondary}>
                    {t.downloadVideos}
                  </a>
                </>
              )}
            </div>
            <p className={styles.downloadsNote}>Les téléchargements peuvent prendre plusieurs minutes.</p>
          </div>
        </div>
      </section>

      {videos.length > 0 && (
        <section className={styles.videoSection}>
          <div className={styles.videoWrapper}>
            <h2 className={`${styles.sectionTitle} ${styles.sectionTitleLight}`}>{t.videosTitle}</h2>
            <div className={styles.videoGrid}>
              {videos.map(v => (
                <div key={v.id} className={styles.videoCard}>
                  <video controls playsInline preload="metadata" className={styles.videoElement}>
                    <source src={`/api/gallery/${gallery.public_id}/media/${v.id}`} type={v.mime_type || "video/mp4"} />
                  </video>
                  <a
                    href={`/api/gallery/${gallery.public_id}/download/original/${v.id}`}
                    download
                    className={styles.videoDownloadLink}
                  >
                    Télécharger l'original
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <section className={styles.photoSection}>
          <div className={styles.photoWrapper}>
            <h2 className={styles.sectionTitle}>{t.photosTitle}</h2>
            <div className={styles.photoGrid}>
              {photos.map(p => {
                const isLandscape = p.width && p.height && p.width > p.height;
                return (
                  <div key={p.id} className={`${styles.photoItem} ${isLandscape ? styles.photoItemLandscape : styles.photoItemPortrait}`}>
                    <picture>
                      <source srcSet={`/api/gallery/${gallery.public_id}/media/${p.id}?width=1920 1920w, /api/gallery/${gallery.public_id}/media/${p.id}?width=1440 1440w, /api/gallery/${gallery.public_id}/media/${p.id}?width=960 960w, /api/gallery/${gallery.public_id}/media/${p.id}?width=480 480w`} sizes="(max-width: 480px) 480px, (max-width: 960px) 960px, (max-width: 1440px) 1440px, 1920px" type="image/webp" />
                      <img
                        src={`/api/gallery/${gallery.public_id}/media/${p.id}?width=960`}
                        loading="lazy"
                        alt={`Photo de ${gallery.bride_names}`}
                        className={styles.photoImg}
                        width={p.width || undefined}
                        height={p.height || undefined}
                      />
                    </picture>
                    <a
                      href={`/api/gallery/${gallery.public_id}/download/original/${p.id}`}
                      className={styles.downloadIcon}
                      title="Télécharger"
                      download
                    >
                      ↓
                    </a>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div className={styles.loadMoreArea}>
                <button onClick={fetchMorePhotos} className={styles.loadMoreBtn} disabled={loading}>
                  {loading ? t.loading : t.loadMore}
                </button>
              </div>
            )}

            <p className={styles.photoCount}>{photos.length} photos affichées</p>
          </div>
        </section>
      )}

      <Footer lang={lang} />
    </div>
  );
}
