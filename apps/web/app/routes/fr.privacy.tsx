import type { Route } from "./+types/fr.privacy";
import { getSeoMeta } from "~/lib/seo";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./legal.module.css";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Politique de confidentialité — Timeless",
    description: "Politique de confidentialité du site Timeless.",
    path: "/fr/confidentialite",
    alternatePath: "/en/privacy",
    lang: "fr",
    noindex: true,
    siteUrl,
  });
}

export default function PrivacyFr() {
  return (
    <div className={styles.container}>
      <Header lang="fr" alternateLangHref="/en/privacy" />
      <main className={styles.mainSection}>
        <div className={styles.wrapper}>
          <h1 className={styles.title}>Politique de confidentialité</h1>
          <div className={styles.content}>
            <h2>Protection des données</h2>
            <p>Timeless s'engage à ce que la collecte et le traitement de vos données, effectués à partir du site, soient conformes au règlement général sur la protection des données (RGPD).</p>
            
            <h2>Utilisation des données</h2>
            <p>Les données personnelles recueillies dans le cadre des services proposés sur ce site sont traitées selon des protocoles sécurisés et permettent à Timeless de gérer les demandes reçues dans ses applications informatiques (formulaire de contact, réservation).</p>
            
            <h2>Cookies</h2>
            <p>Le site utilise des cookies techniques strictement nécessaires à son fonctionnement. Aucun cookie de pistage publicitaire n'est utilisé.</p>
          </div>
        </div>
      </main>
      <Footer lang="fr" />
      <ScrollTop />
    </div>
  );
}
