import type { Route } from "./+types/en.legal";
import { getSeoMeta } from "~/lib/seo";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "../root";
import { STUDIO_NAME } from "~/lib/business-config";
import styles from "./legal.module.css";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Legal Notice — Sempra",
    description: "Legal notice for the Sempra website.",
    path: "/en/legal",
    alternatePath: "/fr/mentions-legales",
    lang: "en",
    noindex: true,
    siteUrl,
  });
}

export default function LegalEn() {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const business = rootData?.siteContent?.business;

  const isComplete = Boolean(
    business?.address && business?.enterpriseNumber && business?.hostingProvider
  );

  return (
    <div className={styles.container}>
      <Header lang="en" alternateLangHref="/fr/mentions-legales" />
      <main className={styles.mainSection}>
        <div className={styles.wrapper}>
          <h1 className={styles.title}>Legal Notice</h1>

          {!isComplete && (
            <div className={styles.draftNotice}>
              This legal notice is currently being finalized and does not constitute a binding legal document.
            </div>
          )}

          <div className={styles.content}>
            <h2>Site Publisher</h2>
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
                Enterprise Number: {business.enterpriseNumber}
              </address>
            ) : (
              <p><em>Information pending finalization.</em></p>
            )}

            <h2>Hosting</h2>
            {business?.hostingProvider ? (
              <p>
                This site is hosted by {business.hostingProvider}.
                {business.hostingAddress && <><br /><span className={styles.preLine}>{business.hostingAddress}</span></>}
              </p>
            ) : (
              <p><em>Information pending finalization.</em></p>
            )}

            <h2>Intellectual Property</h2>
            <p>This entire site is governed by Belgian and international legislation on copyright and intellectual property. All reproduction rights are reserved, including for downloadable documents and iconographic and photographic representations.</p>
          </div>
        </div>
      </main>
      <Footer lang="en" />
      <ScrollTop />
    </div>
  );
}
