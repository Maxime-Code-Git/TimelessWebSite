import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";
import { useRouteLoaderData } from "react-router";
import type { SiteContent } from "~/lib/site-content.server";
import styles from "./about.module.css";

interface AboutPageProps {
  lang: Lang;
}

export function AboutPage({ lang }: AboutPageProps) {
  const rootData = useRouteLoaderData("root") as { siteContent: SiteContent };
  const content = rootData.siteContent.aboutPage;
  const alternateLangHref = lang === "fr" ? "/en/about" : "/fr/a-propos";

  return (
    <>
      <Header lang={lang} alternateLangHref={alternateLangHref} />

      <main id="main-content">
      {/* Hero Section */}
      <section className={styles.heroSection}>
        <h1 className={styles.heroTitle}>{content.hero.title[lang]}</h1>
        <p className={styles.heroSubtitle}>{content.hero.subtitle[lang]}</p>
      </section>

      {/* Duo Section */}
      <section className={styles.duoSection}>
        <div className={styles.duoInner}>
          <div className={styles.duoGrid}>
            <div className={styles.personCard}>
              {content.team.image.imageId ? (
                <div className={styles.personPhoto}>
                  <img
                    src={`/media/home/about-team/${content.team.image.imageId}/640p/webp`}
                    alt={content.team.image.alt?.[lang] || content.team.name[lang]}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className={styles.personPhoto} />
              )}
              <h2 className={styles.personName}>
                {content.team.name[lang]}
              </h2>
              <p className={styles.personRole}>{content.team.role[lang]}</p>
              <p className={styles.personBio}>
                {content.team.bio[lang]}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Approach Section */}
      <section className={styles.approachSection}>
        <div className={styles.approachInner}>
          <p className={styles.approachTitle}>{content.approach.title[lang]}</p>
          <div className={styles.approachGrid}>
            {content.approach.principles.map((p) => (
              <div key={p.id} className={styles.approachItem}>
                <div className={styles.approachDivider} />
                <h3 className={styles.approachItemTitle}>{p.title[lang]}</h3>
                <p className={styles.approachItemText}>{p.text[lang]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Difference Section */}
      <section className={styles.differenceSection}>
        <div className={styles.differenceInner}>
          <p className={styles.differenceTitle}>{content.difference.title[lang]}</p>
          <p className={styles.differenceText}>{content.difference.text[lang]}</p>
        </div>
      </section>
      </main>

      <Footer lang={lang} />
    </>
  );
}
