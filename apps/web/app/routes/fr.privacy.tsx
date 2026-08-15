import type { Route } from "./+types/fr.privacy";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./legal.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Politique de confidentialité — Timeless" },
    { name: "description", content: "Politique de confidentialité du site Timeless." },
    { name: "robots", content: "noindex, nofollow" },
  ];
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
