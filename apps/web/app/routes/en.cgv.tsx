import type { Route } from "./+types/en.cgv";
import { getSeoMeta } from "~/lib/seo";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./legal.module.css";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Terms & Conditions — Timeless",
    description: "Terms and conditions of Timeless.",
    path: "/en/terms",
    alternatePath: "/fr/cgv",
    lang: "en",
    noindex: true,
    siteUrl,
  });
}

export default function CgvEn() {
  return (
    <div className={styles.container}>
      <Header lang="en" alternateLangHref="/fr/cgv" />
      <main className={styles.mainSection}>
        <div className={styles.wrapper}>
          <h1 className={styles.title}>Terms &amp; Conditions</h1>

          <div className={styles.draftNotice}>
            These terms and conditions are being drafted and do not constitute a legally binding contractual document.
          </div>

          <div className={styles.content}>
            <h2>Scope</h2>
            <p>These terms and conditions govern wedding photography and videography services provided by Timeless.</p>

            <h2>Booking</h2>
            {/* Deposit clause removed until the exact percentage is legally validated. */}
            <p>A booking is confirmed upon signing the quote or contract. Payment terms, including any deposit, are specified in the individual quote.</p>

            <h2>Delivery</h2>
            <p>Digital files are delivered via a secure online gallery within the timeframes stated in the quote, according to the chosen package.</p>
          </div>
        </div>
      </main>
      <Footer lang="en" />
      <ScrollTop />
    </div>
  );
}
