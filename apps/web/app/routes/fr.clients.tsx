import type { Route } from "./+types/fr.clients";
import { useActionData } from "react-router";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./clients.module.css";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Espace Clients — Timeless" },
    { name: "description", content: "Retrouvez ici vos photos et votre film, avec le code reçu sur votre carte." },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

/**
 * Action SSR — s'exécute uniquement côté serveur.
 *
 * En Phase 2 : le système d'authentification n'est pas encore disponible.
 * L'action répond proprement avec un statut 503.
 * En Phase 3 : vérification du code en base de données + création de session.
 */
export async function action(_args: Route.ActionArgs) {
  return Response.json(
    { error: "Le service d'authentification n'est pas encore disponible. Veuillez réessayer ultérieurement." },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export default function ClientsFr() {
  const actionData = useActionData<typeof action>();
  const error = actionData && "error" in actionData ? (actionData as { error: string }).error : null;

  return (
    <div className={styles.container}>
      <Header lang="fr" alternateLangHref="/en/client-area" />

      <main>
        <section className={styles.mainSection}>
          <div className={styles.loginCard}>
            <div className={styles.cardDivider}></div>
            <h1 className={styles.cardTitle}>Votre galerie privée</h1>
            <p className={styles.cardText}>Retrouvez ici vos photos et votre film, avec le code reçu sur votre carte.</p>

            <form className={styles.form} method="post">
              <div className={styles.formGroup}>
                <label htmlFor="tm-access-code" className={styles.formLabel}>Votre code d'accès</label>
                <input
                  id="tm-access-code"
                  name="code"
                  type="text"
                  placeholder="Ex. TM-2026-XXXX"
                  className={styles.formInput}
                  required
                />
              </div>
              <button type="submit" className={styles.submitBtn}>Accéder à ma galerie</button>
              {error && <div className={styles.formMessage}>{error}</div>}
            </form>

            <p className={styles.helpText}>
              Vous n'avez pas votre code ? <a href="/fr/contact" className={styles.helpLink}>Contactez-nous</a>.
            </p>

            <div className={styles.footerDivider}></div>
            <p className={styles.footerNote}>Galerie privée et sécurisée</p>
          </div>
        </section>
      </main>

      <Footer lang="fr" />
      <ScrollTop />
    </div>
  );
}
