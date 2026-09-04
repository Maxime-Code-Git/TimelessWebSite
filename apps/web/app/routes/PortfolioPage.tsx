import { useState } from "react";
import { Link } from "react-router";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";
import { getStrings } from "~/lib/i18n";
import type { PublicPortfolioPhoto, PublicPortfolioProject } from "~/lib/portfolio-content.server";
import styles from "./portfolio.module.css";

interface PortfolioPageProps {
  lang: Lang;
  projects: PublicPortfolioProject[];
}

export function getPublicPhotoUrl(
  projectId: string,
  photo: PublicPortfolioPhoto,
  preferredVariant: "480p" | "960p" | "1440p" | "1920p" = "960p"
): string {
  const preferred = photo.variants.find(variant => variant.name === preferredVariant);
  const fallback = photo.variants.at(-1) ?? photo.variants[0];
  const variant = preferred ?? fallback;
  return "/portfolio/media/" + projectId + "/" + photo.id + "/" + variant.name;
}

export function getPublicPhotoSrcSet(projectId: string, photo: PublicPortfolioPhoto): string {
  return photo.variants
    .map(variant => "/portfolio/media/" + projectId + "/" + photo.id + "/" + variant.name + " " + variant.width + "w")
    .join(", ");
}

export function PortfolioPage({ lang, projects }: PortfolioPageProps) {
  const t = getStrings(lang).portfolio;
  const [activeFilter, setActiveFilter] = useState("all");
  const alternateLangHref = lang === "fr" ? "/en/portfolio" : "/fr/portfolio";

  const filters = [
    { key: "all", label: t.filterAll },
    { key: "ceremony", label: t.filterCeremony },
    { key: "portraits", label: t.filterPortraits },
    { key: "reception", label: t.filterReception },
  ];

  const visibleProjects = projects.filter(project => (
    activeFilter === "all" || project.photos.some(photo => photo.category === activeFilter)
  ));

  return (
    <>
      <Header lang={lang} alternateLangHref={alternateLangHref} />

      <main id="main-content">
        <section className={styles.titleSection}>
          <div className={styles.titleDivider} />
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.subtitle}>{t.subtitle}</p>
          <div className={styles.tabs}>
            <a href="#galerie-photo" className={styles.tabBtn + " " + styles.active}>
              {t.tabPhoto}
            </a>
            <a href="#galerie-video" className={styles.tabBtn}>
              {t.tabVideo}
            </a>
          </div>
        </section>

        <section className={styles.filtersSection} aria-label={lang === "fr" ? "Filtrer les projets" : "Filter projects"}>
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
            {visibleProjects.length === 0 ? (
              <p className={styles.emptyState}>
                {lang === "fr" ? "Les prochains reportages arrivent bientôt." : "New stories are coming soon."}
              </p>
            ) : (
              <div className={styles.photoGrid}>
                {visibleProjects.map(project => {
                  const cover = project.photos.find(photo => photo.id === project.coverPhotoId)!;
                  const landscape = cover.width >= cover.height;
                  return (
                    <article
                      key={project.id}
                      className={styles.photoWrap + " " + (landscape ? styles.span2 : styles.span1)}
                    >
                      <Link
                        to={"/" + lang + "/portfolio/" + project.slug[lang]}
                        className={styles.projectLink}
                        aria-label={project.title[lang]}
                      >
                        <img
                          src={getPublicPhotoUrl(project.id, cover)}
                          srcSet={getPublicPhotoSrcSet(project.id, cover)}
                          sizes={landscape ? "(max-width: 720px) 100vw, 1080px" : "(max-width: 720px) 100vw, 526px"}
                          width={cover.width}
                          height={cover.height}
                          alt={cover.alt[lang]}
                          className={styles.photoImage}
                          loading="lazy"
                          decoding="async"
                        />
                        <span className={styles.projectOverlay}>
                          <strong>{project.title[lang]}</strong>
                          {(project.location || project.date) && (
                            <small>{[project.location, project.date].filter(Boolean).join(" · ")}</small>
                          )}
                        </span>
                      </Link>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section id="galerie-video" className={styles.videoSection}>
          <p className={styles.videoEyebrow}>{t.videoEyebrow}</p>
          <h2 className={styles.videoTitle}>{t.videoTitle}</h2>
          <div className={styles.videoPlayerWrap}>
            <div className={styles.videoPoster}>
              {lang === "fr" ? "Le film n'est pas encore disponible." : "Film is not yet available."}
            </div>
          </div>
        </section>
      </main>

      <Footer lang={lang} />
    </>
  );
}
