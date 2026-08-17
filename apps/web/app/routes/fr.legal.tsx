import type { Route } from "./+types/fr.legal";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import { BUSINESS } from "~/lib/business-config";
import styles from "./legal.module.css";

import { getSeoMeta } from "~/lib/seo";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches[0]?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Mentions légales — Timeless",
    description: "Mentions légales du site Timeless.",
    path: "/fr/mentions-legales",
    alternatePath: "/en/legal",
    lang: "fr",
    noindex: true,
    siteUrl,
  });
}

const isComplete = Boolean(
  BUSINESS.address && BUSINESS.enterpriseNumber && BUSINESS.hostingProvider
);

export default function LegalFr() {
  return (
    <div className={styles.container}>
      <Header lang="fr" alternateLangHref="/en/legal" />
      <main className={styles.mainSection}>
        <div className={styles.wrapper}>
          <h1 className={styles.title}>Mentions légales</h1>

          {!isComplete && (
            <div className={styles.draftNotice}>
              Ces mentions légales sont en cours de finalisation et ne constituent pas un document juridique opposable.
            </div>
          )}

          <div className={styles.content}>
            <h2>Éditeur du site</h2>
            {BUSINESS.address && BUSINESS.enterpriseNumber ? (
              <p>
                {BUSINESS.studioName}<br />
                {BUSINESS.address}<br />
                {BUSINESS.email && <>Email : {BUSINESS.email}<br /></>}
                Numéro d'entreprise : {BUSINESS.enterpriseNumber}
              </p>
            ) : (
              <p><em>Informations en cours de finalisation.</em></p>
            )}

            <h2>Hébergement</h2>
            {BUSINESS.hostingProvider ? (
              <p>
                Le site est hébergé par {BUSINESS.hostingProvider}.
                {BUSINESS.hostingAddress && <><br />{BUSINESS.hostingAddress}</>}
              </p>
            ) : (
              <p><em>Informations en cours de finalisation.</em></p>
            )}

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
