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
import { getRawSiteContent, savePricingAndFaq, RevisionConflictError, ValidationError, CorruptedContentError } from "../lib/site-content.server";
import crypto from "node:crypto";
import { requireValidAdminSession, validateAdminFormData, createAdminHeaders, ActionSecurityError } from "../lib/admin-auth.server";
import { commitSession } from "../lib/session.server";
import styles from "./admin.module.css";
import type { PricingCategory, PricingPageContent } from "../lib/site-content.server";

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
    { pricing: content.pricing, pricingPage: content.pricingPage, revision: content.revision, csrfToken, storageWarning: isCorrupted },
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
    const pricingPageJson = String(formData.get("pricingPage"));

    let parsedPricing: PricingCategory;
    let parsedPricingPage: PricingPageContent;
    try {
      parsedPricing = JSON.parse(pricingJson);
      parsedPricingPage = JSON.parse(pricingPageJson);
    } catch {
      return Response.json({ error: "Invalid JSON payload" }, { status: 422 });
    }

    try {
      const newRev = savePricingAndFaq(parsedPricing, parsedPricingPage, revision);
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
  const { pricing, pricingPage, revision, csrfToken, storageWarning } = useLoaderData<typeof loader>();
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
            initialPricingPage={pricingPage}
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

function PricingEditor({ initialPricing, initialPricingPage, revision, error, success, isSubmitting, csrfToken, storageWarning }: {
  initialPricing: PricingCategory,
  initialPricingPage: PricingPageContent,
  revision: string,
  error?: string,
  success?: boolean,
  isSubmitting: boolean,
  csrfToken: string,
  storageWarning: boolean
}) {
  const [pricing, setPricing] = useState<PricingCategory>(initialPricing);
  const [pricingPage, setPricingPage] = useState<PricingPageContent>(initialPricingPage);
  const [activeTab, setActiveTab] = useState<keyof PricingCategory>("photo");


  const handleFaqTitleChange = (lang: "fr"|"en", value: string) => {
    setPricingPage((prev) => ({
      ...prev,
      faqTitle: { ...prev.faqTitle, [lang]: value }
    }));
  };

  const handlePromoFieldChange = (field: "promoText" | "promoTextBold" | "caveat", lang: "fr"|"en", value: string) => {
    setPricingPage((prev) => ({
      ...prev,
      [field]: { ...prev[field], [lang]: value }
    }));
  };

  const handleFaqItemChange = (index: number, field: "question" | "answer", lang: "fr"|"en", value: string) => {
    setPricingPage((prev) => {
      const newFaqs = [...prev.faqs];
      newFaqs[index] = { ...newFaqs[index], [field]: { ...newFaqs[index][field], [lang]: value } };
      return { ...prev, faqs: newFaqs };
    });
  };

  const handleFaqItemToggle = (index: number, value: boolean) => {
    setPricingPage((prev) => {
      const newFaqs = [...prev.faqs];
      newFaqs[index] = { ...newFaqs[index], enabled: value };
      return { ...prev, faqs: newFaqs };
    });
  };

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


  const moveItem = (cat: keyof PricingCategory, formulaIndex: number, itemIndex: number, direction: -1 | 1) => {
    setPricing((prev) => {
      const newItems = [...prev[cat][formulaIndex].includedItems];
      if (itemIndex + direction >= 0 && itemIndex + direction < newItems.length) {
        const temp = newItems[itemIndex];
        newItems[itemIndex] = newItems[itemIndex + direction];
        newItems[itemIndex + direction] = temp;
      }
      return {
        ...prev,
        [cat]: prev[cat].map((f, i) => i === formulaIndex ? { ...f, includedItems: newItems } : f)
      };
    });
  };

  const addItem = (cat: keyof PricingCategory, formulaIndex: number) => {
    setPricing((prev) => {
      const newItems = [...prev[cat][formulaIndex].includedItems, { id: globalThis.crypto.randomUUID(), text: { fr: "", en: "" } }];
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
      <input type="hidden" name="pricingPage" value={JSON.stringify(pricingPage)} />

      {storageWarning && (
        <div className={styles.error} role="alert">Le stockage du contenu doit être vérifié avant toute modification.</div>
      )}
      {error && <div className={styles.error} role="alert">{error}</div>}
      {success && !error && <div className={styles.success} role="status">Formules et questions fréquentes mises à jour avec succès.</div>}

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
          <div key={formula.id} className={styles.formulaEditorCard} data-testid={`formula-card-${activeTab}-${formula.id}`}>
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
                <label htmlFor={`name-fr-${idx}`}>Nom (FR)</label>
                <input id={`name-fr-${idx}`} type="text" value={formula.name.fr} onChange={(e) => handleLocalizedChange(activeTab, idx, "name", "fr", e.target.value)} className={styles.input} />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor={`name-en-${idx}`}>Nom (EN)</label>
                <input id={`name-en-${idx}`} type="text" value={formula.name.en} onChange={(e) => handleLocalizedChange(activeTab, idx, "name", "en", e.target.value)} className={styles.input} />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor={`summary-fr-${idx}`}>Résumé (FR) - affiché sur l'accueil</label>
                <input id={`summary-fr-${idx}`} type="text" value={formula.summary.fr} onChange={(e) => handleLocalizedChange(activeTab, idx, "summary", "fr", e.target.value)} className={styles.input} />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor={`summary-en-${idx}`}>Résumé (EN) - affiché sur l'accueil</label>
                <input id={`summary-en-${idx}`} type="text" value={formula.summary.en} onChange={(e) => handleLocalizedChange(activeTab, idx, "summary", "en", e.target.value)} className={styles.input} />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor={`desc-fr-${idx}`}>Description complète (FR)</label>
                <textarea id={`desc-fr-${idx}`} value={formula.description.fr} onChange={(e) => handleLocalizedChange(activeTab, idx, "description", "fr", e.target.value)} className={styles.textarea} rows={3} />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor={`desc-en-${idx}`}>Description complète (EN)</label>
                <textarea id={`desc-en-${idx}`} value={formula.description.en} onChange={(e) => handleLocalizedChange(activeTab, idx, "description", "en", e.target.value)} className={styles.textarea} rows={3} />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor={`price-${idx}`}>Prix (€)</label>
                <input id={`price-${idx}`} type="number" min="0" max="100000" value={formula.priceCents / 100} onChange={(e) => handleChange(activeTab, idx, "priceEuros", e.target.value)} className={styles.input} />
              </div>
              <div className={styles.formGroup}>
                <div className={styles.flexGap}>
                  <div className={styles.flex1}>
                    <label htmlFor={`btn-fr-${idx}`}>Texte bouton (FR)</label>
                    <input id={`btn-fr-${idx}`} type="text" value={formula.buttonText.fr} onChange={(e) => handleLocalizedChange(activeTab, idx, "buttonText", "fr", e.target.value)} className={styles.input} placeholder="FR" />
                  </div>
                  <div className={styles.flex1}>
                    <label htmlFor={`btn-en-${idx}`}>Texte bouton (EN)</label>
                    <input id={`btn-en-${idx}`} type="text" value={formula.buttonText.en} onChange={(e) => handleLocalizedChange(activeTab, idx, "buttonText", "en", e.target.value)} className={styles.input} placeholder="EN" />
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.itemsSection}>
              <h4>Éléments inclus</h4>
              {formula.includedItems.map((item, itemIdx) => (
                <div key={item.id} className={styles.itemRow}>
                  <input type="text" value={item.text.fr} aria-label={`Élément en français ${itemIdx + 1}`} onChange={(e) => handleItemChange(activeTab, idx, itemIdx, "fr", e.target.value)} className={styles.input} placeholder="Élément (FR)" />
                  <input type="text" value={item.text.en} aria-label={`Élément en anglais ${itemIdx + 1}`} onChange={(e) => handleItemChange(activeTab, idx, itemIdx, "en", e.target.value)} className={styles.input} placeholder="Élément (EN)" />
                  <button type="button" onClick={() => moveItem(activeTab, idx, itemIdx, -1)} disabled={itemIdx === 0} aria-label="Monter l'élément" className={styles.iconBtn}>↑</button>
                  <button type="button" onClick={() => moveItem(activeTab, idx, itemIdx, 1)} disabled={itemIdx === formula.includedItems.length - 1} aria-label="Descendre l'élément" className={styles.iconBtn}>↓</button>
                  <button type="button" onClick={() => removeItem(activeTab, idx, itemIdx)} aria-label="Supprimer cet élément" className={styles.deleteBtn}>X</button>
                </div>
              ))}
              <button type="button" onClick={() => addItem(activeTab, idx)} className={styles.addBtn}>+ Ajouter un élément</button>
            </div>
          </div>
        ))}
      </div>


      <div className={styles.faqEditorSection}>
        <h2 className={styles.faqEditorSectionTitle}>Bloc de mise en avant (Studio unique)</h2>
        <div className={styles.formulaEditorCard}>
          <div className={styles.formulaEditorGrid}>
            <div className={styles.formGroup}>
              <label htmlFor="promo-text-fr">Texte principal (FR)</label>
              <input id="promo-text-fr" type="text" value={pricingPage.promoText.fr} onChange={(e) => handlePromoFieldChange("promoText", "fr", e.target.value)} className={styles.input} />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="promo-text-en">Texte principal (EN)</label>
              <input id="promo-text-en" type="text" value={pricingPage.promoText.en} onChange={(e) => handlePromoFieldChange("promoText", "en", e.target.value)} className={styles.input} />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="promo-bold-fr">Texte mis en valeur (FR)</label>
              <input id="promo-bold-fr" type="text" value={pricingPage.promoTextBold.fr} onChange={(e) => handlePromoFieldChange("promoTextBold", "fr", e.target.value)} className={styles.input} />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="promo-bold-en">Texte mis en valeur (EN)</label>
              <input id="promo-bold-en" type="text" value={pricingPage.promoTextBold.en} onChange={(e) => handlePromoFieldChange("promoTextBold", "en", e.target.value)} className={styles.input} />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="caveat-fr">Note de conservation (FR)</label>
              <input id="caveat-fr" type="text" value={pricingPage.caveat.fr} onChange={(e) => handlePromoFieldChange("caveat", "fr", e.target.value)} className={styles.input} />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="caveat-en">Note de conservation (EN)</label>
              <input id="caveat-en" type="text" value={pricingPage.caveat.en} onChange={(e) => handlePromoFieldChange("caveat", "en", e.target.value)} className={styles.input} />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.faqEditorSection}>
        <h2 className={styles.faqEditorSectionTitle}>Questions fréquentes</h2>

        <div className={styles.formulaEditorCard}>
          <div className={styles.formGroup}>
            <label htmlFor="faq-title-fr">Titre FAQ (FR)</label>
            <input id="faq-title-fr" type="text" value={pricingPage.faqTitle.fr} onChange={(e) => handleFaqTitleChange("fr", e.target.value)} className={styles.input} />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="faq-title-en">Titre FAQ (EN)</label>
            <input id="faq-title-en" type="text" value={pricingPage.faqTitle.en} onChange={(e) => handleFaqTitleChange("en", e.target.value)} className={styles.input} />
          </div>

          <div className={styles.faqListEditor}>
            {pricingPage.faqs.map((faq, idx) => (
              <div key={faq.id} className={styles.faqItemEditor}>
                <div className={styles.formulaEditorHeader}>
                  <h4 className={styles.formulaIdTitle}>FAQ: {faq.id}</h4>
                  <label className={styles.checkboxLabel}>
                    <input type="checkbox" checked={faq.enabled} onChange={(e) => handleFaqItemToggle(idx, e.target.checked)} />
                    Afficher cette question
                  </label>
                </div>

                <div className={styles.formulaEditorGrid}>
                  <div className={styles.formGroup}>
                    <label htmlFor={`faq-q-fr-${idx}`}>Question FR</label>
                    <input id={`faq-q-fr-${idx}`} type="text" value={faq.question.fr} onChange={(e) => handleFaqItemChange(idx, "question", "fr", e.target.value)} className={styles.input} />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor={`faq-q-en-${idx}`}>Question EN</label>
                    <input id={`faq-q-en-${idx}`} type="text" value={faq.question.en} onChange={(e) => handleFaqItemChange(idx, "question", "en", e.target.value)} className={styles.input} />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor={`faq-a-fr-${idx}`}>Réponse FR</label>
                    <textarea id={`faq-a-fr-${idx}`} value={faq.answer.fr} onChange={(e) => handleFaqItemChange(idx, "answer", "fr", e.target.value)} className={styles.textarea} rows={3} />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor={`faq-a-en-${idx}`}>Réponse EN</label>
                    <textarea id={`faq-a-en-${idx}`} value={faq.answer.en} onChange={(e) => handleFaqItemChange(idx, "answer", "en", e.target.value)} className={styles.textarea} rows={3} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
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
