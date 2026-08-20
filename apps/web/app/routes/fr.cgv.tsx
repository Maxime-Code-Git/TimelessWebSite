import type { Route } from "./+types/fr.cgv";
import { getSeoMeta } from "~/lib/seo";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import { BUSINESS } from "~/lib/business-config";
import styles from "./legal.module.css";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Conditions Générales de Vente — Timeless",
    description: "Conditions Générales de Vente de Timeless.",
    path: "/fr/cgv",
    alternatePath: "/en/terms",
    lang: "fr",
    noindex: true,
    siteUrl,
  });
}

export default function CgvFr() {
  return (
    <div className={styles.container}>
      <Header lang="fr" alternateLangHref="/en/terms" />
      <main className={styles.mainSection}>
        <div className={styles.wrapper}>
          <h1 className={styles.title}>Conditions Générales de Vente</h1>

          <div className={styles.draftNotice}>
            Ces conditions générales de vente sont en cours de rédaction et ne constituent pas un document contractuel opposable.
          </div>

          <div className={styles.content}>
            <h2>Objet</h2>
            <p>Les présentes conditions générales de vente régissent les prestations de photographie et vidéographie de mariage réalisées par Timeless.</p>

            <h2>Réservation</h2>
            {/* La clause d'acompte est retirée tant que le pourcentage exact n'est pas validé juridiquement. */}
            <p>La réservation d'une prestation est confirmée à la signature du devis ou contrat. Les modalités de paiement, y compris les acomptes, sont précisées dans le devis individuel.</p>

            <h2>Livraison</h2>
            <p>Les fichiers numériques sont livrés via une galerie en ligne sécurisée dans les délais indiqués sur le devis{BUSINESS.depositPercent !== null ? null : ""}, selon la formule choisie.</p>
          </div>
        </div>
      </main>
      <Footer lang="fr" />
      <ScrollTop />
    </div>
  );
}
