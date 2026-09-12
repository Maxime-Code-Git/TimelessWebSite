import { useState } from "react";
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
import { getRawSiteContent, savePricing, RevisionConflictError, ValidationError, CorruptedContentError } from "../lib/site-content.server";
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
      return Response.json({ error: "Invalid JSON payload" }, { status: 422 });
    }

    try {
      const newRev = savePricing(parsedPricing, revision);
      return Response.json({ success: true, revision: newRev });
    } catch (e: unknown) {
      if (e instanceof CorruptedContentError) {
        return Response.json(
          { error: "Le stockage du contenu doit être vérifié avant toute modification." },
          { status: 409 }
        );
      }
      if (e instanceof RevisionConflictError) {
        return Response.json(
          { error: "Conflit de révision : quelqu'un a modifié les données entre-temps. Veuillez rafraîchir." },
          { status: 409 }
        );
      }
      if (e instanceof ValidationError) {
        return Response.json({ error: e.message }, { status: 422 });
      }
      throw e;
    }
  } catch (e: unknown) {
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


import type { Formula } from "../lib/site-content.server";

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
  const [activeTab, setActiveTab] = useState<keyof PricingCategory>("photo");

  const handleChange = (cat: keyof PricingCategory, index: number, field: keyof Formula | "priceEuros", value: unknown) => {
    setPricing((prev) => {
      const newPricing = {
        ...prev,
        [cat]: prev[cat].map((f, i) => {
          if (field === "featured") {
            return { ...f, featured: value ? (i === index) : f.featured };
          }
          if (i === index) {
            if (field === "priceEuros") {
              return { ...f, priceCents: Math.round(Number(value) * 100) };
            }
            return { ...f, [field]: value };
          }
          return f;
        })
      };
      return newPricing;
    });
  };

  const handleLocalizedChange = (cat: keyof PricingCategory, index: number, field: "name" | "summary" | "description" | "buttonText", lang: "fr" | "en", value: string) => {
    setPricing((prev) => {
      return {
        ...prev,
        [cat]: prev[cat].map((f, i) => {
          if (i === index) {
            return { ...f, [field]: { ...f[field], [lang]: value } };
          }
          return f;
        })
      };
    });
  };

  const handleItemChange = (cat: keyof PricingCategory, formulaIndex: number, itemIndex: number, lang: "fr"|"en", value: string) => {
    setPricing((prev) => {
      const newItems = [...prev[cat][formulaIndex].includedItems];
      newItems[itemIndex] = { ...newItems[itemIndex], text: { ...newItems[itemIndex].text, [lang]: value } };
      return {
        ...prev,
        [cat]: prev[cat].map((f, i) => i === formulaIndex ? { ...f, includedItems: newItems } : f)
      };
    });
  };

  const addItem = (cat: keyof PricingCategory, formulaIndex: number) => {
    setPricing((prev) => {
      const newItems = [...prev[cat][formulaIndex].includedItems, { id: Date.now().toString(), text: { fr: "", en: "" } }];
      return {
        ...prev,
        [cat]: prev[cat].map((f, i) => i === formulaIndex ? { ...f, includedItems: newItems } : f)
      };
    });
  };

  const removeItem = (cat: keyof PricingCategory, formulaIndex: number, itemIndex: number) => {
    setPricing((prev) => {
      const newItems = prev[cat][formulaIndex].includedItems.filter((_, i) => i !== itemIndex);
      return {
        ...prev,
        [cat]: prev[cat].map((f, i) => i === formulaIndex ? { ...f, includedItems: newItems } : f)
      };
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

      <div className={styles.tabs}>
        {(["photo", "film", "duo"] as Array<keyof PricingCategory>).map(cat => (
          <button
            key={cat}
            type="button"
            className={`${styles.tabButton} ${activeTab === cat ? styles.tabButtonActive : ""}`}
            onClick={() => setActiveTab(cat)}
          >
            {cat.toUpperCase()}
          </button>
        ))}
      </div>

      <div className={styles.tabContent}>
        {pricing[activeTab].map((formula, idx) => (
          <div key={formula.id} className={styles.formulaEditorCard}>
            <div className={styles.formulaEditorHeader}>
              <h3 className={styles.formulaIdTitle}>Formule: {formula.id.toUpperCase()}</h3>
              <label className={styles.checkboxLabel}>
                <input type="checkbox" checked={formula.enabled} onChange={(e) => handleChange(activeTab, idx, "enabled", e.target.checked)} />
                Activer cette formule
              </label>
              <label className={styles.checkboxLabel}>
                <input type="radio" name={`featured_${activeTab}`} checked={formula.featured} onChange={() => handleChange(activeTab, idx, "featured", true)} />
                Mettre en avant
              </label>
            </div>

            <div className={styles.formulaEditorGrid}>
              <div className={styles.formGroup}>
                <label>Nom (FR)</label>
                <input type="text" value={formula.name.fr} onChange={(e) => handleLocalizedChange(activeTab, idx, "name", "fr", e.target.value)} className={styles.input} />
              </div>
              <div className={styles.formGroup}>
                <label>Nom (EN)</label>
                <input type="text" value={formula.name.en} onChange={(e) => handleLocalizedChange(activeTab, idx, "name", "en", e.target.value)} className={styles.input} />
              </div>

              <div className={styles.formGroup}>
                <label>Résumé (FR) - affiché sur l'accueil</label>
                <input type="text" value={formula.summary.fr} onChange={(e) => handleLocalizedChange(activeTab, idx, "summary", "fr", e.target.value)} className={styles.input} />
              </div>
              <div className={styles.formGroup}>
                <label>Résumé (EN) - affiché sur l'accueil</label>
                <input type="text" value={formula.summary.en} onChange={(e) => handleLocalizedChange(activeTab, idx, "summary", "en", e.target.value)} className={styles.input} />
              </div>

              <div className={styles.formGroup}>
                <label>Description complète (FR)</label>
                <textarea value={formula.description.fr} onChange={(e) => handleLocalizedChange(activeTab, idx, "description", "fr", e.target.value)} className={styles.textarea} rows={3} />
              </div>
              <div className={styles.formGroup}>
                <label>Description complète (EN)</label>
                <textarea value={formula.description.en} onChange={(e) => handleLocalizedChange(activeTab, idx, "description", "en", e.target.value)} className={styles.textarea} rows={3} />
              </div>

              <div className={styles.formGroup}>
                <label>Prix (€)</label>
                <input type="number" min="0" max="100000" value={formula.priceCents / 100} onChange={(e) => handleChange(activeTab, idx, "priceEuros", e.target.value)} className={styles.input} />
              </div>
              <div className={styles.formGroup}>
                <label>Texte bouton (FR/EN)</label>
                <div className={styles.flexGap}>
                  <input type="text" value={formula.buttonText.fr} onChange={(e) => handleLocalizedChange(activeTab, idx, "buttonText", "fr", e.target.value)} className={styles.input} placeholder="FR" />
                  <input type="text" value={formula.buttonText.en} onChange={(e) => handleLocalizedChange(activeTab, idx, "buttonText", "en", e.target.value)} className={styles.input} placeholder="EN" />
                </div>
              </div>
            </div>

            <div className={styles.itemsSection}>
              <h4>Éléments inclus</h4>
              {formula.includedItems.map((item, itemIdx) => (
                <div key={itemIdx} className={styles.itemRow}>
                  <input type="text" value={item.text.fr} onChange={(e) => handleItemChange(activeTab, idx, itemIdx, "fr", e.target.value)} className={styles.input} placeholder="Élément (FR)" />
                  <input type="text" value={item.text.en} onChange={(e) => handleItemChange(activeTab, idx, itemIdx, "en", e.target.value)} className={styles.input} placeholder="Élément (EN)" />
                  <button type="button" onClick={() => removeItem(activeTab, idx, itemIdx)} className={styles.deleteBtn}>X</button>
                </div>
              ))}
              <button type="button" onClick={() => addItem(activeTab, idx)} className={styles.addBtn}>+ Ajouter un élément</button>
            </div>
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
