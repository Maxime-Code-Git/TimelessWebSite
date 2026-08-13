import type { Route } from "./+types/en.about";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./about.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "About us — Timeless" },
    { name: "description", content: "Two perspectives, one standard: to capture your day authentically, so it returns to you intact in thirty years." },
    { tagName: "link", rel: "canonical", href: "https://timeless.be/en/about" },
    { tagName: "link", rel: "alternate", hrefLang: "fr", href: "https://timeless.be/fr/a-propos" },
    { tagName: "link", rel: "alternate", hrefLang: "en", href: "https://timeless.be/en/about" },
  ];
}

export default function AboutEn() {
  return (
    <div className={styles.container}>
      <Header lang="en" alternateLangHref="/fr/a-propos" />

      <main>
        {/* ── Hero ────────────────────────────────────────── */}
        <section className={styles.hero}>
          <div className={styles.heroDivider}></div>
          <h1 className={styles.heroTitle}>Stop time, make the day eternal.</h1>
          <p className={styles.heroText}>Two perspectives, one standard: to capture your day authentically, so it returns to you intact in thirty years.</p>
        </section>

        {/* ── Duo ─────────────────────────────────────────── */}
        <section className={styles.duoSection}>
          <div className={styles.duoWrapper}>
            <p className={styles.duoTitle}>The Two of Us</p>
            <div className={styles.duoGrid}>
              <div className={styles.person}>
                <div className={styles.personImageWrap}>
                  <div className={styles.personPlaceholder}>Portrait — Photographer</div>
                </div>
                <div className={styles.personName}>Firstname Lastname</div>
                <div className={styles.personRole}>Photographer</div>
                <p className={styles.personBio}>A few lines of introduction: their background, their sensibility, what guides their eye on a wedding day.</p>
              </div>
              <div className={styles.person}>
                <div className={styles.personImageWrap}>
                  <div className={styles.personPlaceholder}>Portrait — Videographer</div>
                </div>
                <div className={styles.personName}>Firstname Lastname</div>
                <div className={styles.personRole}>Videographer</div>
                <p className={styles.personBio}>A few lines of introduction: their background, their sensibility, what guides their eye on a wedding day.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Approach ────────────────────────────────────── */}
        <section className={styles.approachSection}>
          <div className={styles.approachWrapper}>
            <p className={styles.approachTitle}>Our Approach</p>
            <div className={styles.principles}>
              <div className={styles.principle}>
                <div className={styles.principleDivider}></div>
                <h3 className={styles.principleTitle}>Discretion on the D-Day</h3>
                <p className={styles.principleText}>Present without ever imposing, so you can experience your day fully.</p>
              </div>
              <div className={styles.principle}>
                <div className={styles.principleDivider}></div>
                <h3 className={styles.principleTitle}>A Single Studio</h3>
                <p className={styles.principleText}>Photo and film conceived together, for a unified sensibility from start to finish.</p>
              </div>
              <div className={styles.principle}>
                <div className={styles.principleDivider}></div>
                <h3 className={styles.principleTitle}>A Timeless Rendering</h3>
                <p className={styles.principleText}>Sober and lasting choices that age well — far from passing trends.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Difference ──────────────────────────────────── */}
        <section className={styles.differenceSection}>
          <div className={styles.differenceWrapper}>
            <p className={styles.differenceSubtitle}>Our Difference</p>
            <p className={styles.differenceText}>Uniting photo and film under one studio means a consistency of vision from the first to the last shot — and a shared presence on the day, so nothing of your story is missed.</p>
          </div>
        </section>
      </main>

      <Footer lang="en" />
      <ScrollTop />
    </div>
  );
}
