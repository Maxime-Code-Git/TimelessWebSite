import type { Route } from "./+types/fr.legal";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./legal.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Mentions légales — Timeless" },
    { name: "description", content: "Mentions légales du site Timeless." }
  ];
}

export default function LegalFr() {
  return (
    <div className={styles.container}>
      <Header lang="fr" alternateLangHref="/en/legal" />
      <main className={styles.mainSection}>
        <div className={styles.wrapper}>
          <h1 className={styles.title}>Mentions légales</h1>
          <div className={styles.content}>
            <h2>Éditeur du site</h2>
            <p>Timeless Photo & Video<br/>123 Rue de la Photographie, 1000 Bruxelles, Belgique<br/>Email: bonjour@timeless.be<br/>Numéro d'entreprise: BE 0123.456.789</p>
            
            <h2>Hébergement</h2>
            <p>Le site est hébergé par Vercel Inc.<br/>340 S Lemon Ave #4133 Walnut, CA 91789, USA</p>
            
            <h2>Propriété intellectuelle</h2>
            <p>L'ensemble de ce site relève de la législation belge et internationale sur le droit d'auteur et la propriété intellectuelle. Tous les droits de reproduction sont réservés, y compris pour les documents téléchargeables et les représentations iconographiques et photographiques.</p>
          </div>
        </div>
      </main>
      <Footer lang="fr" />
      <ScrollTop />
    </div>
  );
}
