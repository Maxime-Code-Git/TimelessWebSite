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
            {content.team.members.map((member, index) => (
              <div key={index} className={styles.personCard}>
                {member.image.imageId ? (
                  <div className={styles.personPhoto}>
                    <picture>
                      <source
                        type="image/avif"
                        srcSet={`/media/home/about-team/${member.image.imageId}/640p/avif 640w, /media/home/about-team/${member.image.imageId}/960p/avif 960w, /media/home/about-team/${member.image.imageId}/1440p/avif 1440w, /media/home/about-team/${member.image.imageId}/1920p/avif 1920w`}
                        sizes="(max-width: 720px) 100vw, 50vw"
                      />
                      <source
                        type="image/webp"
                        srcSet={`/media/home/about-team/${member.image.imageId}/640p/webp 640w, /media/home/about-team/${member.image.imageId}/960p/webp 960w, /media/home/about-team/${member.image.imageId}/1440p/webp 1440w, /media/home/about-team/${member.image.imageId}/1920p/webp 1920w`}
                        sizes="(max-width: 720px) 100vw, 50vw"
                      />
                      <img
                        src={`/media/home/about-team/${member.image.imageId}/640p/webp`}
                        alt={member.image.alt?.[lang] || member.name[lang]}
                        className={styles.personImage}
                        loading="lazy"
                        decoding="async"
                        width={member.image.width}
                        height={member.image.height}
                      />
                    </picture>
                  </div>
                ) : (
                  <div className={styles.personPhoto} />
                )}
                <h2 className={styles.personName}>
                  {member.name[lang]}
                </h2>
                <p className={styles.personRole}>{member.role[lang]}</p>
                <p className={styles.personBio}>
                  {member.bio[lang]}
                </p>
              </div>
            ))}
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
