import type { Route } from "./+types/en.legal";
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
    title: "Legal Notice — Timeless",
    description: "Legal notice for the Timeless website.",
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
            <h2>Publisher</h2>
            {business?.address && business?.enterpriseNumber ? (
              <p>
                {STUDIO_NAME}<br />
                <span style={{ whiteSpace: "pre-line" }}>{business.address}</span><br />
                {business.email && <>Email: {business.email}<br /></>}
                Enterprise Number: {business.enterpriseNumber}
              </p>
            ) : (
              <p><em>Information currently being finalized.</em></p>
            )}

            <h2>Hosting</h2>
            {business?.hostingProvider ? (
              <p>
                The site is hosted by {business.hostingProvider}.
                {business.hostingAddress && <><br /><span style={{ whiteSpace: "pre-line" }}>{business.hostingAddress}</span></>}
              </p>
            ) : (
              <p><em>Information currently being finalized.</em></p>
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
