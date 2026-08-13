import type { Route } from "./+types/en.clients";
import { useState } from "react";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { ScrollTop } from "~/components/ui/ScrollTop";
import styles from "./clients.module.css";
import { useNavigate } from "react-router";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Client Area — Timeless" },
    { name: "description", content: "Find your photos and film here, using the code received on your card." },
    { tagName: "link", rel: "canonical", href: "https://timeless.be/en/client-area" },
    { tagName: "link", rel: "alternate", hrefLang: "fr", href: "https://timeless.be/fr/espace-clients" },
    { tagName: "link", rel: "alternate", hrefLang: "en", href: "https://timeless.be/en/client-area" },
  ];
}

export default function ClientsEn() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Pour l'instant, aucun backend n'est connecté.
    if (import.meta.env.DEV && code === 'DEMO-EN') {
      navigate('/en/gallery/demo');
      return;
    }
    
    setError("Login failed. The authentication system is not yet available.");
  };

  return (
    <div className={styles.container}>
      <Header lang="en" alternateLangHref="/fr/espace-clients" />

      <main>
        <section className={styles.mainSection}>
          <div className={styles.loginCard}>
            <div className={styles.cardDivider}></div>
            <h1 className={styles.cardTitle}>Your private gallery</h1>
            <p className={styles.cardText}>Find your photos and film here, using the code received on your card.</p>

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label htmlFor="tm-access-code" className={styles.formLabel}>Your access code</label>
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
