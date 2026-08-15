import type { Route } from "./+types/fr.legal";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import { BUSINESS } from "~/lib/business-config";
import styles from "./legal.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Mentions légales — Timeless" },
    { name: "description", content: "Mentions légales du site Timeless." },
    // noindex tant que les informations légales ne sont pas finalisées
    { name: "robots", content: "noindex, nofollow" },
  ];
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
