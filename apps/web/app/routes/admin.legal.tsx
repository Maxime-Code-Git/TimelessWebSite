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
import { requireValidAdminSession } from "~/lib/admin-auth.server";
import { getClientIp, validateOrigin } from "~/lib/security.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import {
  getSiteContent,
  saveLegalPageDraft,
  publishLegalPage,
  type LegalPagesContent,
  type LegalDocument,
  CorruptedContentError,
  RevisionConflictError,
  ValidationError,
} from "~/lib/site-content.server";
import styles from "./admin.module.css";
import { useState } from "react";

const MAX_BODY_SIZE = 500 * 1024; // 500 KB

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireValidAdminSession(request);
  const content = getSiteContent();

  return {
    content,
    csrfToken: session.get("csrfToken") as string,
    revision: content.revision,
    isComplete: Boolean(
      content.business.address &&
      content.business.enterpriseNumber &&
      content.business.hostingProvider
    )
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const session = await requireValidAdminSession(request);

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!validateOrigin(request)) {
    return new Response("Forbidden", { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
    return new Response("Unsupported Media Type", { status: 415 });
  }

  const ip = getClientIp(request);
  if (!ip) return new Response("Forbidden", { status: 403 });
  
  try {
    checkRateLimit(ip, "admin_action");
  } catch {
    return Response.json({ error: "Trop de requêtes." }, { status: 429 });
  }

  const contentLengthStr = request.headers.get("content-length");
  if (!contentLengthStr || !/^\d+$/.test(contentLengthStr)) {
    return new Response("Length Required", { status: 411 });
  }
  
  const contentLength = Number(contentLengthStr);
  if (contentLength > MAX_BODY_SIZE || contentLength < 0 || !Number.isSafeInteger(contentLength)) {
    return Response.json({ error: "Payload Too Large" }, { status: 413 });
  }

  const formData = await request.formData();
  const formCsrf = String(formData.get("csrfToken") || "");
  const sessionCsrf = session.get("csrfToken");

  if (!formCsrf || formCsrf !== sessionCsrf) {
    return new Response("Invalid CSRF token", { status: 403 });
  }

  const intent = formData.get("intent");
  const previousRevision = String(formData.get("revision") || "");
  const pageKey = String(formData.get("pageKey")) as keyof LegalPagesContent;
  
  if (!["mentions", "privacy", "cgv", "cookies"].includes(pageKey)) {
    return Response.json({ error: "Invalid pageKey" }, { status: 400 });
  }

  try {
    const rawData = String(formData.get("data") || "");
    if (!rawData) {
      return Response.json({ error: "Missing data" }, { status: 400 });
    }
    
    let doc: LegalDocument;
    try {
      doc = JSON.parse(rawData);
    } catch {
      return Response.json({ error: "JSON malformé" }, { status: 400 });
    }

    if (intent === "save_draft") {
      saveLegalPageDraft(pageKey, doc, previousRevision);
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
      
      if (pageKey === "cookies") {
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

      publishLegalPage(pageKey, doc, previousRevision);
      return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    }
    
    return Response.json({ error: "Invalid intent" }, { status: 400 });

  } catch (e: unknown) {
    if (e instanceof CorruptedContentError) {
      return Response.json({ error: "Contenu corrompu." }, { status: 500 });
    }
    if (e instanceof RevisionConflictError) {
      return Response.json({ error: "Conflit de révision." }, { status: 409 });
    }
    if (e instanceof ValidationError) {
      return Response.json({ error: e.message }, { status: 422 });
    }
    return Response.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export default function AdminLegal() {
  const { content, csrfToken, revision, isComplete } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string; success?: boolean }>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [activeTab, setActiveTab] = useState<keyof LegalPagesContent>("mentions");
  const [activeLang, setActiveLang] = useState<"fr" | "en">("fr");
  
  const [draft, setDraft] = useState<LegalDocument>(content.legalPages[activeTab].draft);

  const handleTabSwitch = (tab: keyof LegalPagesContent) => {
    setActiveTab(tab);
    setDraft(content.legalPages[tab].draft);
  };

  const updateDraft = (updater: (prev: LegalDocument) => LegalDocument) => {
    setDraft(updater);
  };
  
  const validateForPublish = () => {
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

  // Helper for immutable array updates
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
        </div>

        {actionData?.error && <div className={styles.errorAlert}>{actionData.error}</div>}
        {actionData?.success && <div className={styles.successAlert}>Modifications enregistrées.</div>}
        {!isComplete && <div className={styles.errorAlert}>Attention : Les informations d'entreprise sont incomplètes. La publication est bloquée.</div>}

        <div className={styles.formCard}>
          <div className={styles.langTabs}>
             <button type="button" className={activeLang === "fr" ? styles.tabActive : styles.tab} onClick={() => setActiveLang("fr")}>FR</button>
             <button type="button" className={activeLang === "en" ? styles.tabActive : styles.tab} onClick={() => setActiveLang("en")}>EN</button>
          </div>

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
                          inv[idx] = { ...inv[idx], category: e.target.value as "security" | "admin" | "analytics" | "marketing" | "preferences" };
                          return { ...d, inventory: inv };
                       })}>
                         <option value="security">security</option>
                         <option value="admin">admin</option>
                         <option value="analytics">analytics</option>
                         <option value="marketing">marketing</option>
                         <option value="preferences">preferences</option>
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
                  ...d, inventory: [...(d.inventory || []), { id: `cookie-${Date.now()}`, category: "security", name: { fr: "", en: "" }, provider: { fr: "", en: "" }, purpose: { fr: "", en: "" }, duration: { fr: "", en: "" } }]
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
             <h3 className={styles.sectionTitle}>Historique</h3>
             <ul>
               <li>Version courante publiée : {content.legalPages[activeTab].published?.version || "Aucune"}</li>
               {content.legalPages[activeTab].history.map((h, i) => (
                  <li key={i}>Version {h.version} (Date: {h.effectiveDate})</li>
               ))}
             </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
