import type { Route } from "./+types/en.cgv";
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
    title: "Terms and Conditions — Sempra",
    description: "Terms and Conditions for the Sempra website.",
    path: "/en/terms",
    alternatePath: "/fr/cgv",
    lang: "en",
    noindex: true,
    siteUrl,
  });
}

export default function CgvEn() {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const business = rootData?.siteContent?.business;
  const depositPercent = business?.depositPercent ?? 30;

  return (
    <div className={styles.container}>
      <Header lang="en" alternateLangHref="/fr/cgv" />
      <main className={styles.mainSection}>
        <div className={styles.wrapper}>
          <h1 className={styles.title}>Terms and Conditions</h1>

          <div className={styles.draftNotice}>
            These Terms and Conditions are a provisional model pending legal validation.
          </div>

          <div className={styles.content}>
            <h2>Scope</h2>
            <p>These terms and conditions govern the wedding photography and videography services provided by {STUDIO_NAME}.</p>

            <h2>Booking</h2>
            <p>A booking is only final after the quote is signed and a deposit of {depositPercent}% of the total amount is paid. This deposit is non-refundable in the event of cancellation by the client.</p>

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
