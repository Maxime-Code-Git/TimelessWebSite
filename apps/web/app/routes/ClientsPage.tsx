import { useState } from "react";
import { Link } from "react-router";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";
import { getStrings } from "~/lib/i18n";
import styles from "./clients.module.css";

interface ClientsPageProps {
  lang: Lang;
}

export function ClientsPage({ lang }: ClientsPageProps) {
  const t = getStrings(lang).clients;
  const alternateLangHref = lang === "fr" ? "/en/client-area" : "/fr/espace-clients";
  const contactHref = lang === "fr" ? "/fr/contact" : "/en/contact";

  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate error since no backend is connected yet
    if (code.trim()) {
      setError(true);
    }
  };

  return (
    <>
      {/* Header hidden nav as per maquette */}
      <Header lang={lang} alternateLangHref={alternateLangHref} hideNav />

      <main id="main-content" className={styles.pageWrap}>
        <div className={styles.loginCard}>
          <div className={styles.divider} />
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.subtitle}>{t.subtitle}</p>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label htmlFor="code" className={styles.label}>
                {t.accessLabel}
              </label>
              <input
                type="text"
                id="code"
                className={styles.input}
                placeholder={t.accessPlaceholder}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setError(false);
                }}
                required
              />
            </div>
            
            {error && (
              <div className={styles.errorMsg}>
                {t.unavailableError}
              </div>
            )}

            <button type="submit" className={`btn btn--primary ${styles.submitBtn}`}>
              {t.submitBtn}
            </button>
          </form>

          <p className={styles.helpText}>
            {t.helpText}{" "}
            <Link to={contactHref} className={styles.helpLink}>
              {t.helpLink}
            </Link>
          </p>
        </div>
      </main>

      <Footer lang={lang} />
    </>
  );
}
