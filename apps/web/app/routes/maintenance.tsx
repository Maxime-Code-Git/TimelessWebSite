/**
 * Maintenance page — /maintenance
 * Shown when the site is temporarily unavailable.
 * Explicitly registered in routes.ts — not auto-discovered.
 */
import styles from "./maintenance.module.css";

export function meta() {
  return [
    { title: "Maintenance — Timeless" },
    { name: "description", content: "Le site est temporairement indisponible." },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export default function Maintenance() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <div className={styles.divider}></div>
        <img
          src="/logo-officiel.png"
          alt="Timeless"
          className={styles.logo}
          width={80}
          height={80}
        />
        <h1 className={styles.title}>Site en maintenance</h1>
        <p className={styles.text}>
          Nous effectuons quelques améliorations. Nous serons de retour très bientôt.
        </p>
        <p className={styles.textEn}>
          We are performing some improvements. We will be back very soon.
        </p>
      </main>
    </div>
  );
}
