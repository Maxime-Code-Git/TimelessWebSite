import type { Route } from "./+types/en.legal";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./legal.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Legal Notice — Timeless" },
    { name: "description", content: "Legal notice of the Timeless website." }
  ];
}

export default function LegalEn() {
  return (
    <div className={styles.container}>
      <Header lang="en" alternateLangHref="/fr/mentions-legales" />
      <main className={styles.mainSection}>
        <div className={styles.wrapper}>
          <h1 className={styles.title}>Legal Notice</h1>
          <div className={styles.content}>
            <h2>Publisher</h2>
            <p>Timeless Photo & Video<br/>123 Rue de la Photographie, 1000 Brussels, Belgium<br/>Email: hello@timeless.be<br/>Company Number: BE 0123.456.789</p>
            
            <h2>Hosting</h2>
            <p>The site is hosted by Vercel Inc.<br/>340 S Lemon Ave #4133 Walnut, CA 91789, USA</p>
            
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
