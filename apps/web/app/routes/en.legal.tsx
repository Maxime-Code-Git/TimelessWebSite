import type { Route } from "./+types/en.legal";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import { BUSINESS } from "~/lib/business-config";
import styles from "./legal.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Legal Notice — Timeless" },
    { name: "description", content: "Legal notice of the Timeless website." },
    // noindex until legal information is finalised
    { name: "robots", content: "noindex, nofollow" },
  ];
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
