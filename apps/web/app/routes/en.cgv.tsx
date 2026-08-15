import type { Route } from "./+types/en.cgv";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./legal.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Terms & Conditions — Timeless" },
    { name: "description", content: "Terms and conditions of Timeless." },
    { name: "robots", content: "noindex, nofollow" },
  ];
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
