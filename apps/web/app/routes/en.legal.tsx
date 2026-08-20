import type { Route } from "./+types/en.legal";
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
    title: "Legal Notice — Timeless",
    description: "Legal notice of the Timeless website.",
    path: "/en/legal",
    alternatePath: "/fr/mentions-legales",
    lang: "en",
    noindex: true,
    siteUrl,
  });
}

const isComplete = Boolean(
  BUSINESS.address && BUSINESS.enterpriseNumber && BUSINESS.hostingProvider
);

export default function LegalEn() {
  return (
    <div className={styles.container}>
      <Header lang="en" alternateLangHref="/fr/mentions-legales" />
      <main className={styles.mainSection}>
        <div className={styles.wrapper}>
          <h1 className={styles.title}>Legal Notice</h1>

          {!isComplete && (
            <div className={styles.draftNotice}>
              This legal notice is being finalised and does not constitute a legally binding document.
            </div>
          )}

          <div className={styles.content}>
            <h2>Publisher</h2>
            {BUSINESS.address && BUSINESS.enterpriseNumber ? (
              <p>
                {BUSINESS.studioName}<br />
                {BUSINESS.address}<br />
                {BUSINESS.email && <>Email: {BUSINESS.email}<br /></>}
                Company Number: {BUSINESS.enterpriseNumber}
              </p>
            ) : (
              <p><em>Information being finalised.</em></p>
            )}

            <h2>Hosting</h2>
            {BUSINESS.hostingProvider ? (
              <p>
                The site is hosted by {BUSINESS.hostingProvider}.
                {BUSINESS.hostingAddress && <><br />{BUSINESS.hostingAddress}</>}
              </p>
            ) : (
              <p><em>Information being finalised.</em></p>
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
