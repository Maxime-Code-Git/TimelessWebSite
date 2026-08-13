import type { Route } from "./+types/fr.cgv";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./legal.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Conditions Générales de Vente — Timeless" },
    { name: "description", content: "Conditions Générales de Vente de Timeless." }
  ];
}

export default function CgvFr() {
  return (
    <div className={styles.container}>
      <Header lang="fr" alternateLangHref="/en/terms" />
      <main className={styles.mainSection}>
        <div className={styles.wrapper}>
          <h1 className={styles.title}>Conditions Générales de Vente</h1>
          <div className={styles.content}>
            <h2>Objet</h2>
            <p>Les présentes conditions générales de vente régissent les prestations de photographie et vidéographie de mariage réalisées par Timeless.</p>
            
            <h2>Réservation</h2>
            <p>La réservation d'une prestation n'est définitive qu'à réception d'un acompte de 30% du montant total et de la signature du devis/contrat.</p>
            
            <h2>Livraison</h2>
            <p>Les fichiers numériques sont livrés via une galerie en ligne sécurisée dans les délais indiqués sur le devis, selon la formule choisie.</p>
          </div>
        </div>
      </main>
      <Footer lang="fr" />
      <ScrollTop />
    </div>
  );
}
