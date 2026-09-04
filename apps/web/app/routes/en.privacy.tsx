import type { Route } from "./+types/en.privacy";
import { getSeoMeta } from "~/lib/seo";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import styles from "./legal.module.css";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Privacy Policy — Sempra",
    description: "Privacy policy of the Sempra website.",
    path: "/en/privacy",
    alternatePath: "/fr/confidentialite",
    lang: "en",
    noindex: true,
    siteUrl,
  });
}

export default function PrivacyEn() {
  return (
    <div className={styles.container}>
      <Header lang="en" alternateLangHref="/fr/confidentialite" />
      <main className={styles.mainSection}>
        <div className={styles.wrapper}>
          <h1 className={styles.title}>Privacy Policy</h1>
          <div className={styles.content}>
            <h2>Data Protection</h2>
            <p>Sempra ensures that the collection and processing of your data, carried out from the site, comply with the General Data Protection Regulation (GDPR).</p>
            
            <h2>Data Usage</h2>
            <p>Personal data collected as part of the services offered on this site (contact form) allows Sempra to manage the requests received. This data is transmitted via the third-party transactional email relay service (SMTP) named <strong>Brevo</strong> to be delivered to the Sempra studio mailbox. No information from the contact form is retained or logged on our own servers after the message is transmitted.</p>
            
            <h2>Cookies</h2>
            <p>The site uses technical cookies strictly necessary for its operation. No advertising tracking cookies are used.</p>
          </div>
        </div>
      </main>
      <Footer lang="en" />
      </div>
  );
}
