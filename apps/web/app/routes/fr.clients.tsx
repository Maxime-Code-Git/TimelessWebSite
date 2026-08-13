import type { Route } from "./+types/fr.clients";
import { useState } from "react";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./clients.module.css";
import { useNavigate } from "react-router";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Espace Clients — Timeless" },
    { name: "description", content: "Retrouvez ici vos photos et votre film, avec le code reçu sur votre carte." },
    { tagName: "link", rel: "canonical", href: "https://timeless.be/fr/espace-clients" },
    { tagName: "link", rel: "alternate", hrefLang: "fr", href: "https://timeless.be/fr/espace-clients" },
    { tagName: "link", rel: "alternate", hrefLang: "en", href: "https://timeless.be/en/client-area" },
  ];
}

export default function ClientsFr() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Pour l'instant, aucun backend n'est connecté.
    // Conformément aux instructions, on ne simule pas un succès si le backend n'existe pas.
    // Sauf si c'est un code de démo spécifique en mode dev.
    if (import.meta.env.DEV && code === 'DEMO-FR') {
      navigate('/fr/galerie/demo');
      return;
    }
    
    setError("Connexion impossible. Le système d'authentification n'est pas encore disponible.");
  };

  return (
    <div className={styles.container}>
      <Header lang="fr" alternateLangHref="/en/client-area" />

      <main>
        <section className={styles.mainSection}>
          <div className={styles.loginCard}>
            <div className={styles.cardDivider}></div>
            <h1 className={styles.cardTitle}>Votre galerie privée</h1>
            <p className={styles.cardText}>Retrouvez ici vos photos et votre film, avec le code reçu sur votre carte.</p>

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label htmlFor="tm-access-code" className={styles.formLabel}>Votre code d'accès</label>
                <input 
                  id="tm-access-code" 
                  type="text" 
                  placeholder="Ex. TM-2026-XXXX" 
                  className={styles.formInput} 
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
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
