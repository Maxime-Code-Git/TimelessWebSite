import type { Route } from "./+types/fr.legal";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "../root";
import { STUDIO_NAME } from "~/lib/business-config";
import styles from "./legal.module.css";

import { getSeoMeta } from "~/lib/seo";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Mentions légales — Sempra",
    description: "Mentions légales du site Sempra.",
    path: "/fr/mentions-legales",
    alternatePath: "/en/legal",
    lang: "fr",
    noindex: true,
    siteUrl,
  });
}

export default function LegalFr() {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const business = rootData?.siteContent?.business;

  const isComplete = Boolean(
    business?.address && business?.enterpriseNumber && business?.hostingProvider
  );

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
            {business?.address && business?.enterpriseNumber ? (
              <address>
                <strong>{STUDIO_NAME}</strong><br />
                {business.address && (
                  <>
                    <span className={styles.preLine}>{business.address}</span><br />
                  </>
                )}
                {business.email && <><a href={`mailto:${business.email}`}>{business.email}</a><br /></>}
                {business.phoneDisplay && <a href={`tel:${business.phoneE164}`}>{business.phoneDisplay}</a>}
                <br />
                Numéro d'entreprise : {business.enterpriseNumber}
              </address>
            ) : (
              <p><em>Informations en cours de finalisation.</em></p>
            )}

            <h2>Hébergement</h2>
            {business?.hostingProvider ? (
              <p>
                Le site est hébergé par {business.hostingProvider}.
                {business.hostingAddress && <><br /><span className={styles.preLine}>{business.hostingAddress}</span></>}
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
      </div>
  );
}
