import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getRawSiteContent, savePricing, RevisionConflictError, ValidationError } from "../lib/site-content.server";
import { requireValidAdminSession, validateAdminFormData, createAdminHeaders, ActionSecurityError } from "../lib/admin-auth.server";
import { commitSession } from "../lib/session.server";
import * as crypto from "node:crypto";
import styles from "./admin.module.css";
import type { PricingCategory } from "../lib/site-content.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireValidAdminSession(request);
  const { content, isCorrupted } = getRawSiteContent();

  const headers = createAdminHeaders();
  let csrfToken = session.get("csrfToken");
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    session.set("csrfToken", csrfToken);
    headers.set("Set-Cookie", await commitSession(session));
  }

  return Response.json(
    { pricing: content.pricing, revision: content.revision, csrfToken, storageWarning: isCorrupted },
    { headers }
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const { isCorrupted } = getRawSiteContent();
  if (isCorrupted) {
    return Response.json({ error: "Le stockage du contenu doit être vérifié avant toute modification." }, { status: 409 });
  }

  try {
    const formData = await validateAdminFormData(request);
    const revision = String(formData.get("revision"));

    // We expect the form data to contain a JSON string for simplicity, or we can parse individual fields.
    // For simplicity of dealing with complex nested arrays, the client will send a JSON string.
    const pricingJson = String(formData.get("pricing"));

    let parsedPricing: PricingCategory;
    try {
      parsedPricing = JSON.parse(pricingJson);
    } catch {
      return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    try {
      const newRev = savePricing(parsedPricing, revision);
      return Response.json({ success: true, revision: newRev });
    } catch (e: any) {
      if (e instanceof RevisionConflictError) {
        return Response.json(
          { error: "Conflit de révision : quelqu'un a modifié les données entre-temps. Veuillez rafraîchir." },
          { status: 409 }
        );
      }
      if (e instanceof ValidationError) {
        return Response.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
  } catch (e: any) {
    if (e instanceof ActionSecurityError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export default function AdminPricingPage() {
  const { pricing, revision, csrfToken, storageWarning } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string; success?: boolean; revision?: string }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Using a simple controlled state for the JSON representation is easiest here,
  // but let's build a UI for the user rather than just a JSON textarea.
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <Link to="/admin" className={styles.backLink}>← Retour au tableau de bord</Link>
          <h1 className={styles.headerTitle}>Formules et tarifs</h1>
        </div>
      </header>

      <main className={styles.mainContent}>
        <div className={styles.dashboardCard}>
          <p className={styles.dashboardText}>
            Cette interface permet de modifier les prix (en euros) et de choisir quelle formule mettre en avant.
          </p>

          <PricingEditor
            initialPricing={pricing}
            revision={actionData?.revision || revision}
            error={actionData?.error}
            success={actionData?.success}
            isSubmitting={isSubmitting}
            csrfToken={csrfToken}
            storageWarning={storageWarning}
          />
        </div>
      </main>
    </div>
  );
}

// Client-side React logic to edit pricing
import { useState } from "react";

function PricingEditor({ initialPricing, revision, error, success, isSubmitting, csrfToken, storageWarning }: {
  initialPricing: PricingCategory,
  revision: string,
  error?: string,
  success?: boolean,
  isSubmitting: boolean,
  csrfToken: string,
  storageWarning: boolean
}) {

  const [pricing, setPricing] = useState<PricingCategory>(initialPricing);

  const handleChange = (cat: keyof PricingCategory, index: number, field: "priceEuros" | "featured", value: number | boolean) => {
    setPricing((prev) => {
      // Immutable update
      const newPricing = {
        ...prev,
        [cat]: prev[cat].map((f, i) => {
          if (field === "featured") {
            // Uncheck all other featured items in this category if checking this one
            return { ...f, featured: value ? (i === index) : f.featured };
          }
          if (i === index && field === "priceEuros") {
            return { ...f, priceCents: Math.round(Number(value) * 100) };
          }
          return f;
        })
      };
      return newPricing;
    });
  };

  return (
    <Form method="post" className={styles.formContainer}>
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="pricing" value={JSON.stringify(pricing)} />

      {storageWarning && (
        <div className={styles.error} role="alert">Le stockage du contenu doit être vérifié avant toute modification.</div>
      )}
      {error && <div className={styles.error} role="alert">{error}</div>}
      {success && !error && <div className={styles.success} role="status">Tarifs mis à jour avec succès.</div>}

      <div className={styles.grid}>
        {(Object.keys(pricing) as Array<keyof PricingCategory>).map(cat => (
          <div key={cat} className={styles.catBox}>
            <h3 className={styles.catTitle}>{cat.toUpperCase()}</h3>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Formule</th>
                  <th>Prix (€)</th>
                  <th>Mise en avant</th>
                </tr>
              </thead>
              <tbody>
                {pricing[cat].map((formula, idx) => (
                  <tr key={formula.id}>
                    <td>{formula.id}</td>
                    <td>
                      <label htmlFor={`price_${cat}_${idx}`} className="sr-only">Prix pour {formula.id}</label>
                      <input
                        id={`price_${cat}_${idx}`}
                        type="number"
                        min="1"
                        max="100000"
                        value={formula.priceCents / 100}
                        onChange={(e) => handleChange(cat, idx, "priceEuros", Number(e.target.value))}
                        className={styles.tableInput}
                      />
                    </td>
                    <td>
                      <label htmlFor={`feat_${cat}_${idx}`} className="sr-only">Mettre en avant {formula.id}</label>
                      <input
                        id={`feat_${cat}_${idx}`}
                        type="radio"
                        name={`featured_${cat}`}
                        checked={formula.featured}
                        onChange={() => handleChange(cat, idx, "featured", true)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <button type="submit" disabled={isSubmitting || storageWarning} className={styles.submitButton}>
        {isSubmitting ? "Enregistrement..." : "Enregistrer les modifications"}
      </button>
    </Form>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 401) {
    return null; // Layout will handle auth redirects usually, or admin-auth.server handles it.
  }

  return (
    <div className={styles.errorContainer}>
      <div className={styles.errorBox}>
        <h1 className={styles.errorTitle}>Erreur</h1>
        <p className={styles.errorText}>
          Impossible de charger cette page.
        </p>
        <Link to="/admin" className="btn btn--outline">Retour au tableau de bord</Link>
      </div>
    </div>
  );
}
