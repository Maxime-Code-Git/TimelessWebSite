import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";
import styles from "./gallery.module.css";
import { useState, useCallback, useEffect } from "react";

export interface GalleryMedia {
  id: string;
  type: "photo" | "video";
  mime_type: string;
  width: number | null;
  height: number | null;
}

interface GalleryViewProps {
  lang: Lang;
  gallery: {
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
  const isFr = lang === "fr";
  const t = {
    downloadAll: isFr ? "Tout télécharger (ZIP)" : "Download all (ZIP)",
    downloadPhotos: isFr ? "Photos uniquement" : "Photos only",
    downloadVideos: isFr ? "Vidéos uniquement" : "Videos only",
    photosTitle: isFr ? "La Galerie" : "The Gallery",
    videosTitle: isFr ? "Le Film" : "The Film",
    loadMore: isFr ? "Voir plus" : "View more",
    loading: isFr ? "Chargement..." : "Loading...",
    downloadNote: isFr ? "Les téléchargements peuvent prendre plusieurs minutes." : "Downloads may take several minutes.",
    downloadOriginal: isFr ? "Télécharger l'original" : "Download original",
    photosShown: (n: number) => isFr ? `${n} photos affichées` : `${n} photos shown`,
    photoOf: isFr ? "Photo de" : "Photo of",
    close: isFr ? "Fermer" : "Close",
    previous: isFr ? "Précédent" : "Previous",
    next: isFr ? "Suivant" : "Next",
  };

  const alternateLangHref = isFr ? `/en/gallery/${gallery.public_id}` : `/fr/galerie/${gallery.public_id}`;
  const intro = isFr ? gallery.intro_fr : gallery.intro_en;
  const signature = isFr ? gallery.signature_fr : gallery.signature_en;

  const initialPhotos = media.filter(m => m.type === "photo");
  const videos = media.filter(m => m.type === "video");

  const [photos, setPhotos] = useState<GalleryMedia[]>(initialPhotos);
  const [hasMore, setHasMore] = useState(initialPhotos.length === 24);
  const [loading, setLoading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const fetchMorePhotos = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/gallery/${gallery.public_id}/photos?skip=${photos.length}`);
      if (res.ok) {
        const data = await res.json();
        const newPhotos = data.photos as GalleryMedia[];
        setPhotos(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const deduped = newPhotos.filter(p => !existingIds.has(p.id));
          return [...prev, ...deduped];
        });
        setHasMore(data.hasMore as boolean);
      }
    } catch (e) {
      console.error("Failed to load more photos", e);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, gallery.public_id, photos.length]);

  // Lightbox keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft" && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1);
      if (e.key === "ArrowRight" && lightboxIndex < photos.length - 1) setLightboxIndex(lightboxIndex + 1);
    };
    document.addEventListener("keydown", handler);
    // Prevent body scroll when lightbox is open
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [lightboxIndex, photos.length]);

  const mediaUrl = (id: string) => `/api/gallery/${gallery.public_id}/media/${id}`;

  const coverUrl = gallery.cover_image_id
    ? mediaUrl(gallery.cover_image_id)
    : "/media/home/hero/hero-2/desktop/webp";

  return (
    <div className={styles.container}>
      <Header lang={lang} alternateLangHref={alternateLangHref} />

      <section className={styles.hero}>
        <div className={styles.heroBg}>
          <picture>
            <source srcSet={gallery.cover_image_id ? `${mediaUrl(gallery.cover_image_id)}?width=1920&format=avif` : coverUrl} type="image/avif" />
            <source srcSet={gallery.cover_image_id ? `${mediaUrl(gallery.cover_image_id)}?width=1920&format=webp` : coverUrl} type="image/webp" />
            <img src={coverUrl} alt="Cover" className={styles.heroImage} />
          </picture>
          <div className={styles.heroOverlay} />
        </div>
        <div className={styles.heroContent}>
          <p className={styles.heroSubtitle}>{gallery.location || (isFr ? "Mariage" : "Wedding")}</p>
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
            <p className={styles.downloadsNote}>{t.downloadNote}</p>
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
                    <source src={mediaUrl(v.id)} type={v.mime_type} />
                  </video>
                  <a
                    href={`/api/gallery/${gallery.public_id}/download/original/${v.id}`}
                    download
                    className={styles.videoDownloadLink}
                  >
                    {t.downloadOriginal}
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
              {photos.map((p, idx) => {
                const isLandscape = p.width && p.height && p.width > p.height;
                return (
                  <div key={p.id} className={`${styles.photoItem} ${isLandscape ? styles.photoItemLandscape : styles.photoItemPortrait}`}>
                    <button
                      type="button"
                      className={styles.photoButton}
                      onClick={() => setLightboxIndex(idx)}
                      aria-label={`${t.photoOf} ${gallery.bride_names}`}
                    >
                      <picture>
                        <source
                          srcSet={`${mediaUrl(p.id)}?width=480&format=avif 480w, ${mediaUrl(p.id)}?width=960&format=avif 960w, ${mediaUrl(p.id)}?width=1440&format=avif 1440w, ${mediaUrl(p.id)}?width=1920&format=avif 1920w`}
                          sizes="(max-width: 480px) 480px, (max-width: 960px) 960px, (max-width: 1440px) 1440px, 1920px"
                          type="image/avif"
                        />
                        <source
                          srcSet={`${mediaUrl(p.id)}?width=480&format=webp 480w, ${mediaUrl(p.id)}?width=960&format=webp 960w, ${mediaUrl(p.id)}?width=1440&format=webp 1440w, ${mediaUrl(p.id)}?width=1920&format=webp 1920w`}
                          sizes="(max-width: 480px) 480px, (max-width: 960px) 960px, (max-width: 1440px) 1440px, 1920px"
                          type="image/webp"
                        />
                        <img
                          src={`${mediaUrl(p.id)}?width=960`}
                          srcSet={`${mediaUrl(p.id)}?width=480 480w, ${mediaUrl(p.id)}?width=960 960w, ${mediaUrl(p.id)}?width=1440 1440w, ${mediaUrl(p.id)}?width=1920 1920w`}
                          sizes="(max-width: 480px) 480px, (max-width: 960px) 960px, (max-width: 1440px) 1440px, 1920px"
                          loading="lazy"
                          alt={`${t.photoOf} ${gallery.bride_names}`}
                          className={styles.photoImg}
                          width={p.width || undefined}
                          height={p.height || undefined}
                        />
                      </picture>
                    </button>
                    <a
                      href={`/api/gallery/${gallery.public_id}/download/original/${p.id}`}
                      className={styles.downloadIcon}
                      title={t.downloadOriginal}
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

            <p className={styles.photoCount}>{t.photosShown(photos.length)}</p>
          </div>
        </section>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && photos[lightboxIndex] && (
        <div
          className={styles.lightboxOverlay}
          onClick={() => setLightboxIndex(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${t.photoOf} ${gallery.bride_names}`}
        >
          <div className={styles.lightboxContent} onClick={e => e.stopPropagation()}>
            <button
              className={styles.lightboxClose}
              onClick={() => setLightboxIndex(null)}
              aria-label={t.close}
              type="button"
            >
              ✕
            </button>

            {lightboxIndex > 0 && (
              <button
                className={styles.lightboxPrev}
                onClick={() => setLightboxIndex(lightboxIndex - 1)}
                aria-label={t.previous}
                type="button"
              >
                ‹
              </button>
            )}

            <img
              src={`${mediaUrl(photos[lightboxIndex].id)}?width=1920`}
              alt={`${t.photoOf} ${gallery.bride_names}`}
              className={styles.lightboxImage}
            />

            {lightboxIndex < photos.length - 1 && (
              <button
                className={styles.lightboxNext}
                onClick={() => setLightboxIndex(lightboxIndex + 1)}
                aria-label={t.next}
                type="button"
              >
                ›
              </button>
            )}

            <a
              href={`/api/gallery/${gallery.public_id}/download/original/${photos[lightboxIndex].id}`}
              download
              className={styles.lightboxDownload}
            >
              {t.downloadOriginal}
            </a>
          </div>
        </div>
      )}

      <Footer lang={lang} />
    </div>
  );
}
