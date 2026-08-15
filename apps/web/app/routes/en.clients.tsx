import type { Route } from "./+types/en.clients";
import { useActionData } from "react-router";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./clients.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Client Area — Timeless" },
    { name: "description", content: "Find your photos and film here, using the code received on your card." },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

/**
 * SSR action — server-side only.
 *
 * Phase 2: authentication system not yet available.
 * Returns a clean 503 response.
 * Phase 3: verify code against database + create session.
 */
export async function action(_args: Route.ActionArgs) {
  return Response.json(
    { error: "The authentication service is not yet available. Please try again later." },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export default function ClientsEn() {
  const actionData = useActionData<typeof action>();
  const error = actionData && "error" in actionData ? (actionData as { error: string }).error : null;

  return (
    <div className={styles.container}>
      <Header lang="en" alternateLangHref="/fr/espace-clients" />

      <main>
        <section className={styles.mainSection}>
          <div className={styles.loginCard}>
            <div className={styles.cardDivider}></div>
            <h1 className={styles.cardTitle}>Your private gallery</h1>
            <p className={styles.cardText}>Find your photos and film here, using the code received on your card.</p>

            <form className={styles.form} method="post">
              <div className={styles.formGroup}>
                <label htmlFor="tm-access-code" className={styles.formLabel}>Your access code</label>
                <input
                  id="tm-access-code"
                  name="code"
                  type="text"
                  placeholder="Ex. TM-2026-XXXX"
                  className={styles.formInput}
                  required
                />
              </div>
              <button type="submit" className={styles.submitBtn}>Access my gallery</button>
              {error && <div className={styles.formMessage}>{error}</div>}
            </form>

            <p className={styles.helpText}>
              Don't have your code? <a href="/en/contact" className={styles.helpLink}>Contact us</a>.
            </p>

            <div className={styles.footerDivider}></div>
            <p className={styles.footerNote}>Private and secure gallery</p>
          </div>
        </section>
      </main>

      <Footer lang="en" />
      <ScrollTop />
    </div>
  );
}
