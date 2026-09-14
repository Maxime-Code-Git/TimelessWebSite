import { Form, Link, useActionData, useNavigation, useLoaderData } from "react-router";
import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import type { Lang } from "~/lib/i18n";
import { getStrings } from "~/lib/i18n";
import styles from "./clients.module.css";
import { useState } from "react";

interface ClientsPageProps {
  lang: Lang;
}

export function ClientsPage({ lang }: ClientsPageProps) {
  const t = getStrings(lang).clients;
  const alternateLangHref = lang === "fr" ? "/en/client-area" : "/fr/espace-clients";
  const contactHref = lang === "fr" ? "/fr/contact" : "/en/contact";

  const [code, setCode] = useState("");
  const actionData = useActionData<{ error?: string }>();
  const navigation = useNavigation();
  const loaderData = useLoaderData<{ csrf?: string }>();
  const isSubmitting = navigation.state === "submitting";

  return (
    <>
      <Header lang={lang} alternateLangHref={alternateLangHref} hideNav />

      <main id="main-content" className={styles.pageWrap}>
        <div className={styles.loginCard}>
          <div className={styles.divider} />
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.subtitle}>{t.subtitle}</p>

          <Form method="post" className={styles.form}>
            {loaderData?.csrf && <input type="hidden" name="csrf" value={loaderData.csrf} />}
            <div className={styles.formGroup}>
              <label htmlFor="code" className={styles.label}>
                {t.accessLabel}
              </label>
              <input
                type="text"
                id="code"
                name="code"
                className={styles.input}
                placeholder={t.accessPlaceholder}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
              />
            </div>

            {actionData?.error && (
              <div className={styles.errorMsg} role="alert">
                {actionData.error}
              </div>
            )}

            <button type="submit" disabled={isSubmitting} className={`btn btn--primary ${styles.submitBtn}`}>
              {isSubmitting ? "..." : t.submitBtn}
            </button>
          </Form>

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
