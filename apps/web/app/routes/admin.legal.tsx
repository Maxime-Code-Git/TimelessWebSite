import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { requireValidAdminSession, validateAdminFormData, createAdminHeaders, ActionSecurityError } from "~/lib/admin-auth.server";
import { commitSession } from "~/lib/session.server";
import * as crypto from "node:crypto";
import {
  getSiteContent,
  saveLegalPageDraft,
  publishLegalPage,
  saveLegalUI,
  type LegalPagesContent,
  type LegalDocument,
  type LegalUI,
  type LocalizedString,
  type CookieInventoryItem,
  type LegalSection,
  type SiteContent,
  CorruptedContentError,
  RevisionConflictError,
  ValidationError,
} from "~/lib/site-content.server";
import styles from "./admin.module.css";
import { useState } from "react";
import { LegalPageView } from "~/components/legal/LegalPageView";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireValidAdminSession(request);
  const content = getSiteContent();

  const headers = createAdminHeaders();
  let csrfToken = session.get("csrfToken");
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    session.set("csrfToken", csrfToken);
    headers.set("Set-Cookie", await commitSession(session));
  }

  return Response.json(
    {
      content,
      csrfToken,
      revision: content.revision,
      isComplete: Boolean(
        content.business.address &&
        content.business.enterpriseNumber &&
        content.business.hostingProvider
      )
    },
    { headers }
  );
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const formData = await validateAdminFormData(request);

    const intent = formData.get("intent");
    const previousRevision = String(formData.get("revision") || "");
    const pageKey = String(formData.get("pageKey"));

    if (pageKey === "legalUI" && intent === "save_ui") {
      const rawData = String(formData.get("data") || "");
      if (!rawData) return Response.json({ error: "Missing data" }, { status: 400 });
      let doc: LegalUI;
      try {
        doc = JSON.parse(rawData);
      } catch {
        return Response.json({ error: "JSON malformé" }, { status: 400 });
      }
      try {
        saveLegalUI(doc, previousRevision);
        return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
      } catch (e: unknown) {
        if (e instanceof CorruptedContentError) return Response.json({ error: "Contenu corrompu." }, { status: 500 });
        if (e instanceof RevisionConflictError) return Response.json({ error: "Conflit de révision." }, { status: 409 });
        if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: 422 });
        return Response.json({ error: "Erreur serveur." }, { status: 500 });
      }
    }

    if (!["mentions", "privacy", "cgv", "cookies"].includes(pageKey)) {
      return Response.json({ error: "Invalid pageKey" }, { status: 400 });
    }

    const typedPageKey = pageKey as keyof LegalPagesContent;
    const rawData = String(formData.get("data") || "");
    if (!rawData) return Response.json({ error: "Missing data" }, { status: 400 });

    let doc: LegalDocument;
    try {
      doc = JSON.parse(rawData);
    } catch {
      return Response.json({ error: "JSON malformé" }, { status: 400 });
    }

    try {
      if (intent === "save_draft") {
        saveLegalPageDraft(typedPageKey, doc, previousRevision);
        return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
      } else if (intent === "publish") {
        const siteContent = getSiteContent();
        const b = siteContent.business;

        if (!b.address || !b.enterpriseNumber || !b.hostingProvider) {
           return Response.json({ error: "Informations légales indispensables manquantes." }, { status: 422 });
        }
        if (!doc.effectiveDate) {
           return Response.json({ error: "La date d'entrée en vigueur est requise pour publier." }, { status: 422 });
        }
        if (!doc.seoTitle.fr?.trim() || !doc.seoTitle.en?.trim() || !doc.seoDescription.fr?.trim() || !doc.seoDescription.en?.trim() || !doc.publicTitle.fr?.trim() || !doc.publicTitle.en?.trim() || !doc.intro.fr?.trim() || !doc.intro.en?.trim()) {
           return Response.json({ error: "Les titres et introductions SEO/Publics doivent être renseignés." }, { status: 422 });
        }

        if (doc.sections.length === 0) {
           return Response.json({ error: "Au moins une section est obligatoire." }, { status: 422 });
        }

        const ids = new Set<string>();
        for (const section of doc.sections) {
           if (ids.has(section.id)) {
             return Response.json({ error: "ID de section dupliqué." }, { status: 422 });
           }
           ids.add(section.id);

           if (!section.title.fr?.trim() || !section.title.en?.trim()) {
             return Response.json({ error: "Une section manque de titre." }, { status: 422 });
           }
           for (const p of section.paragraphs) {
             if (!p.fr?.trim() || !p.en?.trim()) return Response.json({ error: "Un paragraphe est vide." }, { status: 422 });
           }
           for (const li of section.listItems || []) {
             if (!li.fr?.trim() || !li.en?.trim()) return Response.json({ error: "Un élément de liste est vide." }, { status: 422 });
           }
        }

        if (typedPageKey === "cookies") {
          if (!doc.inventory || doc.inventory.length === 0) {
            return Response.json({ error: "La page cookies requiert un inventaire valide." }, { status: 422 });
          }
          const cookieIds = new Set<string>();
          for (const cookie of doc.inventory) {
            if (cookieIds.has(cookie.id)) {
              return Response.json({ error: "ID de cookie dupliqué." }, { status: 422 });
            }
            cookieIds.add(cookie.id);
          }
        }

        publishLegalPage(typedPageKey, doc, previousRevision);
        return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
      }

      return Response.json({ error: "Invalid intent" }, { status: 400 });

    } catch (e: unknown) {
      if (e instanceof CorruptedContentError) return Response.json({ error: "Contenu corrompu." }, { status: 500 });
      if (e instanceof RevisionConflictError) return Response.json({ error: "Conflit de révision." }, { status: 409 });
      if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: 422 });
      return Response.json({ error: "Erreur serveur." }, { status: 500 });
    }
  } catch (e: unknown) {
    if (e instanceof ActionSecurityError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

type TabType = keyof LegalPagesContent | "legalUI";

export default function AdminLegal() {
  const { content, csrfToken, revision, isComplete } = useLoaderData<typeof loader>() as { content: SiteContent, csrfToken: string, revision: string, isComplete: boolean };
  const actionData = useActionData<{ error?: string; success?: boolean }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [activeTab, setActiveTab] = useState<TabType>("mentions");
  const [activeLang, setActiveLang] = useState<"fr" | "en">("fr");

  const [draft, setDraft] = useState<LegalDocument>(content.legalPages.mentions.draft);
  const [uiDraft, setUiDraft] = useState<LegalUI>(content.legalUI);

  const handleTabSwitch = (tab: TabType) => {
    setActiveTab(tab);
    if (tab !== "legalUI") {
      setDraft(content.legalPages[tab as keyof LegalPagesContent].draft);
    } else {
      setUiDraft(content.legalUI);
    }
  };

  const updateDraft = (updater: (prev: LegalDocument) => LegalDocument) => {
    setDraft(updater);
  };

  const updateUiDraft = (updater: (prev: LegalUI) => LegalUI) => {
    setUiDraft(updater);
  };

  const validateForPublish = () => {
     if (activeTab === "legalUI") return null;
     if (!isComplete) return "Les informations d'entreprise (adresse, n° entreprise, hébergeur) doivent être remplies dans les paramètres avant de publier.";
     if (!draft.effectiveDate) return "Veuillez définir une date d'entrée en vigueur.";
     for (const section of draft.sections) {
        if (!section.title.fr.trim() || !section.title.en.trim()) return `La section ${section.id} n'a pas de titre.`;
        if (section.paragraphs.some(p => !p.fr.trim() || !p.en.trim())) return `La section ${section.id} a des paragraphes vides.`;
     }
     if (activeTab === "cookies" && (!draft.inventory || draft.inventory.length === 0)) {
        return "La page cookies requiert un inventaire.";
     }
     return null;
  };

  const publishError = validateForPublish();

  const moveItem = <T,>(arr: T[], index: number, dir: 1 | -1): T[] => {
    if (index + dir < 0 || index + dir >= arr.length) return arr;
    const res = [...arr];
    const temp = res[index];
    res[index] = res[index + dir];
    res[index + dir] = temp;
    return res;
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <Link to="/admin" className={styles.backButton}>&larr; Retour</Link>
          <h1 className={styles.headerTitle}>Pages Légales</h1>
        </div>
      </header>

      <main className={styles.mainContent}>
        <div className={styles.tabs}>
          <button type="button" className={activeTab === "mentions" ? styles.tabActive : styles.tab} onClick={() => handleTabSwitch("mentions")}>Mentions Légales</button>
          <button type="button" className={activeTab === "privacy" ? styles.tabActive : styles.tab} onClick={() => handleTabSwitch("privacy")}>Confidentialité</button>
          <button type="button" className={activeTab === "cgv" ? styles.tabActive : styles.tab} onClick={() => handleTabSwitch("cgv")}>CGV</button>
          <button type="button" className={activeTab === "cookies" ? styles.tabActive : styles.tab} onClick={() => handleTabSwitch("cookies")}>Cookies</button>
          <button type="button" className={activeTab === "legalUI" ? styles.tabActive : styles.tab} onClick={() => handleTabSwitch("legalUI")}>Libellés UI</button>
        </div>

        {actionData?.error && <div className={styles.errorAlert}>{actionData.error}</div>}
        {actionData?.success && <div className={styles.successAlert}>Modifications enregistrées.</div>}
        {!isComplete && activeTab !== "legalUI" && <div className={styles.errorAlert}>Attention : Les informations d'entreprise sont incomplètes. La publication est bloquée.</div>}

        <div className={styles.formCard}>
          <div className={styles.langTabs}>
             <button type="button" className={activeLang === "fr" ? styles.tabActive : styles.tab} onClick={() => setActiveLang("fr")}>FR</button>
             <button type="button" className={activeLang === "en" ? styles.tabActive : styles.tab} onClick={() => setActiveLang("en")}>EN</button>
          </div>

          {activeTab === "legalUI" ? (
             <div className={styles.sectionCard}>
               <h3 className={styles.sectionTitle}>Libellés de l'interface légale</h3>
               {[
                 { key: "draftWarning", label: "Avertissement Brouillon" },
                 { key: "hostedBy", label: "Hébergé par" },
                 { key: "toBeDefined", label: "À définir" },
                 { key: "enterpriseNumber", label: "N° d'entreprise" },
                 { key: "vatNumber", label: "N° TVA" },
                 { key: "effectiveDate", label: "Date d'entrée en vigueur" },
                 { key: "unpublishedDraft", label: "Brouillon non publié" },
                 { key: "cookiesInventoryTitle", label: "Titre inventaire cookies" },
                 { key: "cookiesInventoryEmpty", label: "Texte inventaire vide" },
                 { key: "cookieColName", label: "Colonne Nom" },
                 { key: "cookieColProvider", label: "Colonne Fournisseur" },
                 { key: "cookieColCategory", label: "Colonne Catégorie" },
                 { key: "cookieColPurpose", label: "Colonne Finalité" },
                 { key: "cookieColDuration", label: "Colonne Durée" },
                 { key: "versionLabel", label: "Label Version" }
               ].map((field) => (
                  <div className={styles.fieldGroup} key={field.key}>
                    <label htmlFor={field.key}>{field.label}</label>
                    <input
                       id={field.key}
                       type="text"
                       className={styles.input}
                       value={(uiDraft[field.key as keyof LegalUI] as LocalizedString)[activeLang]}
                       onChange={e => updateUiDraft(d => ({
                          ...d,
                          [field.key]: { ...(d[field.key as keyof LegalUI] as LocalizedString), [activeLang]: e.target.value }
                       }))}
                    />
                  </div>
               ))}

               <div className={styles.submitGroup}>
                 <Form method="post">
                    <input type="hidden" name="intent" value="save_ui" />
                    <input type="hidden" name="csrfToken" value={csrfToken} />
                    <input type="hidden" name="revision" value={revision} />
                    <input type="hidden" name="pageKey" value="legalUI" />
                    <input type="hidden" name="data" value={JSON.stringify(uiDraft)} />
                    <button type="submit" disabled={isSubmitting} className={styles.actionButton}>
                       Enregistrer Libellés
                    </button>
                 </Form>
               </div>
             </div>
          ) : (
             <>
                <div className={styles.fieldGroup}>
                  <label htmlFor="seoTitle">Titre SEO</label>
                  <input
                     id="seoTitle"
                     type="text"
                     className={styles.input}
                     value={draft.seoTitle[activeLang]}
                     onChange={e => updateDraft(d => ({ ...d, seoTitle: { ...d.seoTitle, [activeLang]: e.target.value } }))}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="seoDesc">Description SEO</label>
                  <textarea
                     id="seoDesc"
                     className={styles.textarea}
                     value={draft.seoDescription[activeLang]}
                     onChange={e => updateDraft(d => ({ ...d, seoDescription: { ...d.seoDescription, [activeLang]: e.target.value } }))}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="pubTitle">Titre Public</label>
                  <input
                     id="pubTitle"
                     type="text"
                     className={styles.input}
                     value={draft.publicTitle[activeLang]}
                     onChange={e => updateDraft(d => ({ ...d, publicTitle: { ...d.publicTitle, [activeLang]: e.target.value } }))}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="intro">Introduction</label>
                  <textarea
                     id="intro"
                     className={styles.textarea}
                     value={draft.intro[activeLang]}
                     onChange={e => updateDraft(d => ({ ...d, intro: { ...d.intro, [activeLang]: e.target.value } }))}
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="effectiveDate">Date d'entrée en vigueur (YYYY-MM-DD)</label>
                  <input
                     id="effectiveDate"
                     type="date"
                     className={styles.input}
                     value={draft.effectiveDate || ""}
                     onChange={e => updateDraft(d => ({ ...d, effectiveDate: e.target.value || null }))}
                  />
                </div>

                <h3 className={styles.sectionTitle}>Sections</h3>
                {draft.sections.map((section, idx) => (
                   <div key={idx} className={styles.sectionCard}>
                      <div className={styles.fieldGroup}>
                        <label htmlFor={`sectionTitle-${idx}`}>ID ({section.id}) - Titre</label>
                        <div className={styles.headerTitleGroup}>
                           <input
                              id={`sectionTitle-${idx}`}
                              type="text"
                              className={styles.input}
                              value={section.title[activeLang]}
                              onChange={e => updateDraft(d => {
                                 const newSections = d.sections.map((s, i) => i === idx ? { ...s, title: { ...s.title, [activeLang]: e.target.value } } : s);
                                 return { ...d, sections: newSections };
                              })}
                           />
                           <button type="button" aria-label="Monter section" className={styles.actionButtonSecondary} onClick={() => updateDraft(d => ({ ...d, sections: moveItem(d.sections, idx, -1) }))} disabled={idx === 0}>&uarr;</button>
                           <button type="button" aria-label="Descendre section" className={styles.actionButtonSecondary} onClick={() => updateDraft(d => ({ ...d, sections: moveItem(d.sections, idx, 1) }))} disabled={idx === draft.sections.length - 1}>&darr;</button>
                           <button type="button" aria-label="Supprimer section" className={styles.deleteButton} onClick={() => updateDraft(d => ({ ...d, sections: d.sections.filter((_, i) => i !== idx) }))}>X</button>
                        </div>
                      </div>

                      {section.paragraphs.map((p, pIdx) => (
                         <div className={styles.fieldGroup} key={`p-${pIdx}`}>
                           <label htmlFor={`paragraph-${idx}-${pIdx}`}>Paragraphe {pIdx + 1}</label>
                           <div className={styles.headerTitleGroup}>
                              <textarea
                                 id={`paragraph-${idx}-${pIdx}`}
                                 className={styles.textarea}
                                 value={p[activeLang]}
                                 onChange={e => updateDraft(d => {
                                    const newSections = [...d.sections];
                                    const newParagraphs = [...newSections[idx].paragraphs];
                                    newParagraphs[pIdx] = { ...newParagraphs[pIdx], [activeLang]: e.target.value };
                                    newSections[idx] = { ...newSections[idx], paragraphs: newParagraphs };
                                    return { ...d, sections: newSections };
                                 })}
                              />
                              <button type="button" aria-label="Monter paragraphe" className={styles.actionButtonSecondary} onClick={() => updateDraft(d => {
                                 const newSections = [...d.sections];
                                 newSections[idx] = { ...newSections[idx], paragraphs: moveItem(newSections[idx].paragraphs, pIdx, -1) };
                                 return { ...d, sections: newSections };
                              })} disabled={pIdx === 0}>&uarr;</button>
                              <button type="button" aria-label="Descendre paragraphe" className={styles.actionButtonSecondary} onClick={() => updateDraft(d => {
                                 const newSections = [...d.sections];
                                 newSections[idx] = { ...newSections[idx], paragraphs: moveItem(newSections[idx].paragraphs, pIdx, 1) };
                                 return { ...d, sections: newSections };
                              })} disabled={pIdx === section.paragraphs.length - 1}>&darr;</button>
                              <button type="button" aria-label="Supprimer paragraphe" className={styles.deleteButton} onClick={() => updateDraft(d => {
                                 const newSections = [...d.sections];
                                 newSections[idx] = { ...newSections[idx], paragraphs: newSections[idx].paragraphs.filter((_, i) => i !== pIdx) };
                                 return { ...d, sections: newSections };
                              })}>X</button>
                           </div>
                         </div>
                      ))}
                      <button type="button" className={styles.actionButtonSecondary} onClick={() => updateDraft(d => {
                         const newSections = [...d.sections];
                         newSections[idx] = { ...newSections[idx], paragraphs: [...newSections[idx].paragraphs, { fr: "", en: "" }] };
                         return { ...d, sections: newSections };
                      })}>+ Ajouter paragraphe</button>

                      {(section.listItems || []).length > 0 && (
                        <div className={styles.fieldGroup}>
                           <h4>Éléments de liste</h4>
                           {(section.listItems || []).map((li, liIdx) => (
                              <div className={styles.fieldGroup} key={`li-${liIdx}`}>
                                <label htmlFor={`listitem-${idx}-${liIdx}`}>Élément {liIdx + 1}</label>
                                <div className={styles.headerTitleGroup}>
                                   <input
                                      id={`listitem-${idx}-${liIdx}`}
                                      type="text"
                                      className={styles.input}
                                      value={li[activeLang]}
                                      onChange={e => updateDraft(d => {
                                         const newSections = [...d.sections];
                                         const newListItems = [...(newSections[idx].listItems || [])];
                                         newListItems[liIdx] = { ...newListItems[liIdx], [activeLang]: e.target.value };
                                         newSections[idx] = { ...newSections[idx], listItems: newListItems };
                                         return { ...d, sections: newSections };
                                      })}
                                   />
                                   <button type="button" aria-label="Monter élément" className={styles.actionButtonSecondary} onClick={() => updateDraft(d => {
                                      const newSections = [...d.sections];
                                      newSections[idx] = { ...newSections[idx], listItems: moveItem(newSections[idx].listItems || [], liIdx, -1) };
                                      return { ...d, sections: newSections };
                                   })} disabled={liIdx === 0}>&uarr;</button>
                                   <button type="button" aria-label="Descendre élément" className={styles.actionButtonSecondary} onClick={() => updateDraft(d => {
                                      const newSections = [...d.sections];
                                      newSections[idx] = { ...newSections[idx], listItems: moveItem(newSections[idx].listItems || [], liIdx, 1) };
                                      return { ...d, sections: newSections };
                                   })} disabled={liIdx === (section.listItems || []).length - 1}>&darr;</button>
                                   <button type="button" aria-label="Supprimer élément" className={styles.deleteButton} onClick={() => updateDraft(d => {
                                      const newSections = [...d.sections];
                                      newSections[idx] = { ...newSections[idx], listItems: (newSections[idx].listItems || []).filter((_, i) => i !== liIdx) };
                                      return { ...d, sections: newSections };
                                   })}>X</button>
                                </div>
                              </div>
                           ))}
                        </div>
                      )}
                      <div className={styles.fieldGroup}>
                        <button type="button" className={styles.actionButtonSecondary} onClick={() => updateDraft(d => {
                           const newSections = [...d.sections];
                           newSections[idx] = { ...newSections[idx], listItems: [...(newSections[idx].listItems || []), { fr: "", en: "" }] };
                           return { ...d, sections: newSections };
                        })}>+ Ajouter élément de liste</button>
                      </div>

                   </div>
                ))}
                <div className={styles.fieldGroup}>
                  <button type="button" className={styles.actionButton} onClick={() => updateDraft(d => ({
                     ...d, sections: [...d.sections, { id: `section-${Date.now()}`, title: { fr: "", en: "" }, paragraphs: [], listItems: [] }]
                  }))}>+ Ajouter Section</button>
                </div>

                {activeTab === "cookies" && (
                   <div className={styles.sectionCard}>
                     <h3 className={styles.sectionTitle}>Inventaire des Cookies</h3>
                     {(draft.inventory || []).map((cookie, idx) => (
                        <div key={`cookie-${idx}`} className={styles.card}>
                           <div className={styles.fieldGroup}>
                             <label htmlFor={`cookie-name-${idx}`}>Nom</label>
                             <div className={styles.headerTitleGroup}>
                                <input id={`cookie-name-${idx}`} className={styles.input} value={cookie.name[activeLang]} onChange={e => updateDraft(d => {
                                   const inv = [...(d.inventory || [])];
                                   inv[idx] = { ...inv[idx], name: { ...inv[idx].name, [activeLang]: e.target.value } };
                                   return { ...d, inventory: inv };
                                })} />
                                <button type="button" aria-label="Monter cookie" className={styles.actionButtonSecondary} onClick={() => updateDraft(d => ({ ...d, inventory: moveItem(d.inventory || [], idx, -1) }))} disabled={idx === 0}>&uarr;</button>
                                <button type="button" aria-label="Descendre cookie" className={styles.actionButtonSecondary} onClick={() => updateDraft(d => ({ ...d, inventory: moveItem(d.inventory || [], idx, 1) }))} disabled={idx === (draft.inventory || []).length - 1}>&darr;</button>
                                <button type="button" aria-label="Supprimer cookie" className={styles.deleteButton} onClick={() => updateDraft(d => ({ ...d, inventory: (d.inventory || []).filter((_, i) => i !== idx) }))}>X</button>
                             </div>
                           </div>
                           <div className={styles.fieldGroup}>
                             <label htmlFor={`cookie-cat-${idx}`}>Catégorie</label>
                             <select id={`cookie-cat-${idx}`} className={styles.input} value={cookie.category} onChange={e => updateDraft(d => {
                                const inv = [...(d.inventory || [])];
                                inv[idx] = { ...inv[idx], category: e.target.value as CookieInventoryItem["category"] };
                                return { ...d, inventory: inv };
                             })}>
                               <option value="necessary">necessary</option>
                               <option value="admin">admin</option>
                               <option value="gallery">gallery</option>
                               <option value="security">security</option>
                               <option value="video">video</option>
                               <option value="analytics">analytics</option>
                               <option value="ads">ads</option>
                             </select>
                           </div>
                           <div className={styles.fieldGroup}>
                             <label htmlFor={`cookie-prov-${idx}`}>Fournisseur</label>
                             <input id={`cookie-prov-${idx}`} className={styles.input} value={cookie.provider[activeLang]} onChange={e => updateDraft(d => {
                                const inv = [...(d.inventory || [])];
                                inv[idx] = { ...inv[idx], provider: { ...inv[idx].provider, [activeLang]: e.target.value } };
                                return { ...d, inventory: inv };
                             })} />
                           </div>
                           <div className={styles.fieldGroup}>
                             <label htmlFor={`cookie-purp-${idx}`}>Finalité</label>
                             <input id={`cookie-purp-${idx}`} className={styles.input} value={cookie.purpose[activeLang]} onChange={e => updateDraft(d => {
                                const inv = [...(d.inventory || [])];
                                inv[idx] = { ...inv[idx], purpose: { ...inv[idx].purpose, [activeLang]: e.target.value } };
                                return { ...d, inventory: inv };
                             })} />
                           </div>
                           <div className={styles.fieldGroup}>
                             <label htmlFor={`cookie-dur-${idx}`}>Durée</label>
                             <input id={`cookie-dur-${idx}`} className={styles.input} value={cookie.duration[activeLang]} onChange={e => updateDraft(d => {
                                const inv = [...(d.inventory || [])];
                                inv[idx] = { ...inv[idx], duration: { ...inv[idx].duration, [activeLang]: e.target.value } };
                                return { ...d, inventory: inv };
                             })} />
                           </div>
                        </div>
                     ))}
                     <button type="button" className={styles.actionButton} onClick={() => updateDraft(d => ({
                        ...d, inventory: [...(d.inventory || []), { id: `cookie-${Date.now()}`, category: "necessary", name: { fr: "", en: "" }, provider: { fr: "", en: "" }, purpose: { fr: "", en: "" }, duration: { fr: "", en: "" } }]
                     }))}>+ Ajouter Cookie</button>
                   </div>
                )}

                <div className={styles.submitGroup}>
                   <Form method="post">
                      <input type="hidden" name="intent" value="save_draft" />
                      <input type="hidden" name="csrfToken" value={csrfToken} />
                      <input type="hidden" name="revision" value={revision} />
                      <input type="hidden" name="pageKey" value={activeTab} />
                      <input type="hidden" name="data" value={JSON.stringify(draft)} />
                      <button type="submit" disabled={isSubmitting} className={styles.actionButtonSecondary}>
                         Enregistrer le brouillon
                      </button>
                   </Form>

                   <Form method="post">
                      <input type="hidden" name="intent" value="publish" />
                      <input type="hidden" name="csrfToken" value={csrfToken} />
                      <input type="hidden" name="revision" value={revision} />
                      <input type="hidden" name="pageKey" value={activeTab} />
                      <input type="hidden" name="data" value={JSON.stringify(draft)} />
                      <button type="submit" disabled={isSubmitting || !!publishError} className={publishError ? styles.actionButtonSecondary : styles.actionButton} title={publishError || ""}>
                         Publier
                      </button>
                   </Form>
                </div>
                {publishError && <p className={styles.errorAlert}>{publishError}</p>}

                <div className={styles.sectionCard}>
                   <h3 className={styles.sectionTitle}>Aperçu du brouillon (FR)</h3>
                   <div style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '4px', backgroundColor: 'var(--color-bg)' }}>
                     <LegalPageView lang={activeLang} alternateLangHref="#" document={draft} isDraft={true} />
                   </div>
                </div>

                <div className={styles.sectionCard}>
                   <h3 className={styles.sectionTitle}>Historique</h3>
                   <ul>
                     {content.legalPages[activeTab].published ? (
                       <li>
                         <strong>Version {content.legalPages[activeTab].published.version} (Courante)</strong> - {content.legalPages[activeTab].published.effectiveDate}
                         <details>
                           <summary>Voir le contenu</summary>
                           <div style={{ paddingLeft: '1rem', borderLeft: '2px solid #ccc', marginTop: '0.5rem' }}>
                             <p><strong>Titre:</strong> {content.legalPages[activeTab].published.publicTitle[activeLang]}</p>
                             <p><strong>Intro:</strong> {content.legalPages[activeTab].published.intro[activeLang]}</p>
                             {content.legalPages[activeTab].published.sections.map((s: LegalSection) => (
                               <div key={s.id}>
                                 <p><strong>{s.title[activeLang]}</strong></p>
                                 <p>{s.paragraphs[0]?.[activeLang]}...</p>
                               </div>
                             ))}
                           </div>
                         </details>
                       </li>
                     ) : (
                       <li>Aucune version publiée.</li>
                     )}

                     {content.legalPages[activeTab].history.map((h: LegalDocument, i: number) => (
                        <li key={i}>
                           <strong>Version {h.version} (Archivée)</strong> - {h.effectiveDate}
                           <details>
                             <summary>Voir le contenu</summary>
                             <div style={{ paddingLeft: '1rem', borderLeft: '2px solid #ccc', marginTop: '0.5rem' }}>
                               <p><strong>Titre:</strong> {h.publicTitle[activeLang]}</p>
                               <p><strong>Intro:</strong> {h.intro[activeLang]}</p>
                               {h.sections.map((s: LegalSection) => (
                                 <div key={s.id}>
                                   <p><strong>{s.title[activeLang]}</strong></p>
                                   <p>{s.paragraphs[0]?.[activeLang]}...</p>
                                 </div>
                               ))}
                             </div>
                           </details>
                        </li>
                     ))}
                   </ul>
                </div>
             </>
          )}
        </div>
      </main>
    </div>
  );
}
