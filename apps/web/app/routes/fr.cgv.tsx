import type { Route } from "./+types/fr.cgv";
import { getSeoMeta } from "~/lib/seo";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import { useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "../root";
import { STUDIO_NAME } from "~/lib/business-config";
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
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const business = rootData?.siteContent?.business;
  const depositPercent = business?.depositPercent ?? 30;

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
            <p>Les présentes conditions générales de vente régissent les prestations de photographie et vidéographie de mariage réalisées par {STUDIO_NAME}.</p>

            <h2>Réservation</h2>
            <p>La réservation n'est définitive qu'après signature du devis et versement d'un acompte de {depositPercent} % du montant total. Cet acompte n'est pas remboursable en cas d'annulation par le client.</p>

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
