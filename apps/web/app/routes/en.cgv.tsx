import type { Route } from "./+types/en.cgv";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./legal.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Terms and Conditions — Timeless" },
    { name: "description", content: "Terms and Conditions of Timeless." }
  ];
}

export default function CgvEn() {
  return (
    <div className={styles.container}>
      <Header lang="en" alternateLangHref="/fr/cgv" />
      <main className={styles.mainSection}>
        <div className={styles.wrapper}>
          <h1 className={styles.title}>Terms and Conditions</h1>
          <div className={styles.content}>
            <h2>Purpose</h2>
            <p>These general terms and conditions govern the wedding photography and videography services provided by Timeless.</p>
            
            <h2>Booking</h2>
            <p>The booking of a service is only final upon receipt of a 30% deposit of the total amount and the signing of the quote/contract.</p>
            
            <h2>Delivery</h2>
            <p>Digital files are delivered via a secure online gallery within the timeframe indicated on the quote, depending on the chosen package.</p>
          </div>
        </div>
      </main>
      <Footer lang="en" />
      <ScrollTop />
    </div>
  );
}
