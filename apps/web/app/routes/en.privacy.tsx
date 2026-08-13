import type { Route } from "./+types/en.privacy";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./legal.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Privacy Policy — Timeless" },
    { name: "description", content: "Privacy policy of the Timeless website." }
  ];
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
            <p>Timeless ensures that the collection and processing of your data, carried out from the site, comply with the General Data Protection Regulation (GDPR).</p>
            
            <h2>Data Usage</h2>
            <p>Personal data collected as part of the services offered on timeless.be are processed via secure protocols and allow Timeless to manage requests received in its IT applications (contact form, booking).</p>
            
            <h2>Cookies</h2>
            <p>The site uses technical cookies strictly necessary for its operation. No advertising tracking cookies are used.</p>
          </div>
        </div>
      </main>
      <Footer lang="en" />
      <ScrollTop />
    </div>
  );
}
