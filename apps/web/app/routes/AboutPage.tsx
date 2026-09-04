import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";
import { getStrings } from "~/lib/i18n";
import styles from "./about.module.css";

interface AboutPageProps {
  lang: Lang;
}

export function AboutPage({ lang }: AboutPageProps) {
  const t = getStrings(lang).about;
  const alternateLangHref = lang === "fr" ? "/en/about" : "/fr/a-propos";

  return (
    <>
      <Header lang={lang} alternateLangHref={alternateLangHref} />

      <main id="main-content">
      {/* Hero Section */}
      <section className={styles.heroSection}>
        <h1 className={styles.heroTitle}>{t.heroTitle}</h1>
        <p className={styles.heroSubtitle}>{t.heroSubtitle}</p>
      </section>

      {/* Duo Section */}
      <section className={styles.duoSection}>
        <div className={styles.duoInner}>
          <div className={styles.duoGrid}>
            <div className={styles.personCard}>
              <div className={styles.personPhoto} />
              <h2 className={styles.personName}>
                {lang === "fr" ? "L'équipe Sempra" : "The Sempra Team"}
              </h2>
              <p className={styles.personRole}>{t.personRole1} & {t.personRole2}</p>
              <p className={styles.personBio}>
                {lang === "fr"
                  ? "Nous sommes un studio spécialisé dans la photographie et la vidéo de mariage. Notre objectif est de capturer votre journée de manière authentique, avec deux regards complémentaires."
                  : "We are a studio specialized in wedding photography and videography. Our goal is to capture your day authentically, with two complementary perspectives."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Approach Section */}
      <section className={styles.approachSection}>
        <div className={styles.approachInner}>
          <p className={styles.approachTitle}>{t.approachTitle}</p>
          <div className={styles.approachGrid}>
            {t.principles.map((p, i) => (
              <div key={i} className={styles.approachItem}>
                <div className={styles.approachDivider} />
                <h3 className={styles.approachItemTitle}>{p.title}</h3>
                <p className={styles.approachItemText}>{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Difference Section */}
      <section className={styles.differenceSection}>
        <div className={styles.differenceInner}>
          <p className={styles.differenceTitle}>{t.differenceTitle}</p>
          <p className={styles.differenceText}>{t.differenceText}</p>
        </div>
      </section>
      </main>

      <Footer lang={lang} />
    </>
  );
}
