import { useState, useMemo } from "react";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";
import { getStrings } from "~/lib/i18n";
import type { PublicPortfolio, PublicPortfolioPhoto } from "~/lib/portfolio-content.server";
import styles from "./portfolio.module.css";

interface PortfolioPageProps {
  lang: Lang;
  portfolio: PublicPortfolio;
}

export function getVideoEmbedUrl(video: { provider: "youtube" | "vimeo", videoId: string } | null): string | null {
  if (!video) return null;
  if (video.provider === "youtube") return `https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1`;
  if (video.provider === "vimeo") return `https://player.vimeo.com/video/${video.videoId}?autoplay=1`;
  return null;
}

export function getPublicPhotoUrl(
  photo: PublicPortfolioPhoto,
  preferredVariant: "480p" | "960p" | "1440p" | "1920p" = "960p"
): string {
  const preferred = photo.variants.find(variant => variant.name === preferredVariant);
  const fallback = photo.variants.at(-1) ?? photo.variants[0];
  const variant = preferred ?? fallback;
  return "/portfolio/media/" + photo.id + "/" + variant.name;
}

export function getPublicPhotoSrcSet(photo: PublicPortfolioPhoto): string {
  return photo.variants
    .map(variant => "/portfolio/media/" + photo.id + "/" + variant.name + " " + variant.width + "w")
    .join(", ");
}

export function PortfolioPage({ lang, portfolio }: PortfolioPageProps) {
  const t = getStrings(lang).portfolio;
  const [activeFilter, setActiveFilter] = useState("all");
  const alternateLangHref = lang === "fr" ? "/en/portfolio" : "/fr/portfolio";

  const filters = [
    { key: "all", label: t.filterAll },
    ...portfolio.categories.map(cat => ({
      key: cat.slug,
      label: cat.name[lang]
    }))
  ];

  const visiblePhotos = useMemo(() => {
    return portfolio.photos.filter(photo => (
      activeFilter === "all" || photo.categorySlug === activeFilter
    ));
  }, [portfolio.photos, activeFilter]);

  const hasVideo = portfolio.video !== null;
  const [videoPlaying, setVideoPlaying] = useState(false);

  return (
    <>
      <Header lang={lang} alternateLangHref={alternateLangHref} />

      <main id="main-content">
        <section className={styles.titleSection}>
          <div className={styles.titleDivider} />
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.subtitle}>{t.subtitle}</p>
          {hasVideo && (
            <div className={styles.tabs}>
              <a href="#galerie-photo" className={styles.tabBtn + " " + styles.active}>
                {t.tabPhoto}
              </a>
              <a href="#galerie-video" className={styles.tabBtn}>
                {t.tabVideo}
              </a>
            </div>
          )}
        </section>

        <section className={styles.filtersSection} aria-label={lang === "fr" ? "Filtrer les photos" : "Filter photos"}>
          <div className={styles.filters}>
            {filters.map(filter => (
              <button
                type="button"
                key={filter.key}
                onClick={() => setActiveFilter(filter.key)}
                className={styles.filterBtn + " " + (activeFilter === filter.key ? styles.active : "")}
                aria-pressed={activeFilter === filter.key}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </section>

        <section id="galerie-photo" className={styles.photoSection}>
          <div className={styles.photoInner}>
            {visiblePhotos.length === 0 ? (
              <p className={styles.emptyState}>
                {lang === "fr" ? "Notre portfolio sera bientôt disponible." : "Our portfolio will be available soon."}
              </p>
            ) : (
              <div className={styles.photoGrid}>
                {visiblePhotos.map((photo, index) => {
                  const landscape = photo.width >= photo.height;
                  return (
                    <article
                      key={photo.id}
                      className={styles.photoWrap + " " + (landscape ? styles.span2 : styles.span1)}
                    >
                      <img
                        src={getPublicPhotoUrl(photo)}
                        srcSet={getPublicPhotoSrcSet(photo)}
                        sizes={landscape ? "(max-width: 720px) 100vw, 1080px" : "(max-width: 720px) 100vw, 526px"}
                        width={photo.width}
                        height={photo.height}
                        alt={photo.alt[lang] || ""}
                        className={styles.photoImage}
                        loading={index === 0 ? "eager" : "lazy"}
                        fetchPriority={index === 0 ? "high" : "auto"}
                        decoding="async"
                      />
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {hasVideo && portfolio.video && (
          <section id="galerie-video" className={styles.videoSection}>
            <p className={styles.videoEyebrow}>{t.videoEyebrow}</p>
            <h2 className={styles.videoTitle}>{t.videoTitle}</h2>
            <div className={styles.videoList}>
              <div className={styles.videoPlayerWrap}>
                {!videoPlaying ? (
                  <button
                    type="button"
                    className={styles.playButton}
                    onClick={() => setVideoPlaying(true)}
                    aria-label={lang === "fr" ? "Lire la vidéo" : "Play video"}
                  >
                    {lang === "fr" ? "Lire la vidéo" : "Play video"}
                  </button>
                ) : (
                  <iframe
                    src={getVideoEmbedUrl(portfolio.video)!}
                    className={styles.videoIframe}
                    frameBorder="0"
                    title={lang === "fr" ? "Vidéo de présentation" : "Presentation video"}
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                    allowFullScreen
                  ></iframe>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer lang={lang} />
    </>
  );
}
