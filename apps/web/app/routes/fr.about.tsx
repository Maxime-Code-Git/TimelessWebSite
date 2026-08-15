import type { Route } from "./+types/fr.about";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import { BUSINESS } from "~/lib/business-config";
import styles from "./about.module.css";

export async function loader() {
  return { siteUrl: process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "" };
}

export function meta(args: Route.MetaArgs) {
  const data = (args as any).data || (args as any).loaderData;
  const base = data?.siteUrl ?? "";
  return [
    { title: "À propos — Timeless" },
    { name: "description", content: "Deux regards, une même exigence : capter votre journée avec justesse, pour qu'elle vous revienne intacte dans trente ans." },
    ...(base ? [
      { tagName: "link" as const, rel: "canonical", href: `${base}/fr/a-propos` },
      { tagName: "link" as const, rel: "alternate", hrefLang: "fr", href: `${base}/fr/a-propos` },
      { tagName: "link" as const, rel: "alternate", hrefLang: "en", href: `${base}/en/about` },
    ] : []),
  ];
}

export default function AboutFr() {
  return (
    <div className={styles.container}>
      <Header lang="fr" alternateLangHref="/en/about" />

      <main>
        {/* ── Hero ────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.heroDivider}></div>
          <h1 className={styles.heroTitle}>Arrêter le temps, rendre le jour éternel.</h1>
          <p className={styles.heroText}>Deux regards, une même exigence : capter votre journée avec justesse, pour qu'elle vous revienne intacte dans trente ans.</p>
        </section>

        {/* ── Duo ─────────────────────────────────────────── */}
        <section className={styles.duoSection}>
          <div className={styles.duoWrapper}>
            <p className={styles.duoTitle}>Nous deux</p>
            <div className={styles.duoGrid}>
              <div className={styles.person}>
                <div className={styles.personImageWrap}>
                  <div className={styles.personPlaceholder}>Portrait — Photographe</div>
                </div>
                {BUSINESS.photographer1Name && (
                  <div className={styles.personName}>{BUSINESS.photographer1Name}</div>
                )}
                <div className={styles.personRole}>{BUSINESS.photographer1Role}</div>
                <p className={styles.personBio}>Son parcours, sa sensibilité, ce qui guide son regard le jour d'un mariage.</p>
              </div>
              <div className={styles.person}>
                <div className={styles.personImageWrap}>
                  <div className={styles.personPlaceholder}>Portrait — Vidéaste</div>
                </div>
                {BUSINESS.photographer2Name && (
                  <div className={styles.personName}>{BUSINESS.photographer2Name}</div>
                )}
                <div className={styles.personRole}>{BUSINESS.photographer2Role}</div>
                <p className={styles.personBio}>Son parcours, sa sensibilité, ce qui guide son regard le jour d'un mariage.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Approach ────────────────────────────────────── */}
        <section className={styles.approachSection}>
          <div className={styles.approachWrapper}>
            <p className={styles.approachTitle}>Notre approche</p>
            <div className={styles.principles}>
              <div className={styles.principle}>
                <div className={styles.principleDivider}></div>
                <h3 className={styles.principleTitle}>Discrétion le jour J</h3>
                <p className={styles.principleText}>Présents sans jamais s'imposer, pour que vous viviez votre journée pleinement.</p>
              </div>
              <div className={styles.principle}>
                <div className={styles.principleDivider}></div>
                <h3 className={styles.principleTitle}>Un seul studio</h3>
                <p className={styles.principleText}>Photo et film pensés ensemble, pour une même sensibilité du début à la fin.</p>
              </div>
              <div className={styles.principle}>
                <div className={styles.principleDivider}></div>
                <h3 className={styles.principleTitle}>Un rendu intemporel</h3>
                <p className={styles.principleText}>Des choix sobres et durables, qui vieillissent bien — loin des effets de mode.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Difference ──────────────────────────────────── */}
        <section className={styles.differenceSection}>
          <div className={styles.differenceWrapper}>
            <p className={styles.differenceSubtitle}>Notre différence</p>
            <p className={styles.differenceText}>Réunir la photo et le film sous un même studio, c'est une cohérence de regard du premier au dernier plan — et une présence commune le jour J, pour ne rien manquer de votre histoire.</p>
          </div>
        </section>
      </main>

      <Footer lang="fr" />
      <ScrollTop />
    </div>
  );
}
