import { Link } from "react-router";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";
import type { PublicPortfolioProject } from "~/lib/portfolio-content.server";
import { getPublicPhotoSrcSet, getPublicPhotoUrl } from "./PortfolioPage";
import styles from "./portfolio.module.css";

interface PortfolioProjectPageProps {
  lang: Lang;
  project: PublicPortfolioProject;
}

export function PortfolioProjectPage({ lang, project }: PortfolioProjectPageProps) {
  const alternateLang = lang === "fr" ? "en" : "fr";
  const formattedDate = project.date
    ? new Intl.DateTimeFormat(lang === "fr" ? "fr-BE" : "en-GB", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(project.date + "T00:00:00.000Z"))
    : null;

  return (
    <>
      <Header
        lang={lang}
        alternateLangHref={"/" + alternateLang + "/portfolio/" + project.slug[alternateLang]}
      />

      <main id="main-content">
        <header className={styles.projectHeader}>
          <Link to={"/" + lang + "/portfolio"} className={styles.backLink}>
            {lang === "fr" ? "← Retour au portfolio" : "← Back to portfolio"}
          </Link>
          <div className={styles.titleDivider} />
          <h1 className={styles.title}>{project.title[lang]}</h1>
          {(project.location || formattedDate) && (
            <p className={styles.projectMeta}>
              {[project.location, formattedDate].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className={styles.projectDescription}>{project.description[lang]}</p>
        </header>

        <section className={styles.photoSection} aria-label={lang === "fr" ? "Photos du projet" : "Project photos"}>
          <div className={styles.photoInner}>
            <div className={styles.projectPhotoGrid}>
              {project.photos.map(photo => {
                const landscape = photo.width >= photo.height;
                return (
                  <figure
                    key={photo.id}
                    className={styles.projectPhoto + " " + (landscape ? styles.projectPhotoLandscape : "")}
                  >
                    <img
                      src={getPublicPhotoUrl(project.id, photo, "1440p")}
                      srcSet={getPublicPhotoSrcSet(project.id, photo)}
                      sizes={landscape ? "(max-width: 720px) 100vw, 1080px" : "(max-width: 720px) 100vw, 526px"}
                      width={photo.width}
                      height={photo.height}
                      alt={photo.alt[lang]}
                      className={styles.photoImage}
                      loading="lazy"
                      decoding="async"
                    />
                  </figure>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <Footer lang={lang} />
    </>
  );
}
