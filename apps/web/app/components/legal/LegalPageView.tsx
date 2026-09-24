import { Header } from "~/components/layout/Header";
import { Footer } from "~/components/layout/Footer";
import { useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "~/root";
import { STUDIO_NAME } from "~/lib/business-config";
import styles from "~/routes/legal.module.css";
import type { LegalDocument, LegalSection } from "~/lib/site-content.server";

interface Props {
  lang: "fr" | "en";
  alternateLangHref: string;
  document: LegalDocument;
  isDraft: boolean;
}

export function LegalPageView({ lang, alternateLangHref, document, isDraft }: Props) {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const business = rootData?.siteContent?.business;

  const isComplete = Boolean(
    business?.address && business?.enterpriseNumber && business?.hostingProvider
  );

  const showWarning = isDraft || !isComplete;

  const formatIdentity = () => {
    if (!business) return null;
    return (
      <address>
        <strong>{business.legalName || business.tradeName || STUDIO_NAME}</strong><br />
        {business.address && (
          <>
            <span className={styles.preLine}>{business.address}</span><br />
          </>
        )}
        {business.email && <><a href={`mailto:${business.email}`}>{business.email}</a><br /></>}
        {business.phoneDisplay && <a href={`tel:${business.phoneE164}`}>{business.phoneDisplay}</a>}
        <br />
        {business.enterpriseNumber && <>{lang === "fr" ? "Numéro d'entreprise" : "Enterprise Number"} : {business.enterpriseNumber}<br /></>}
        {business.vatNumber && <>{lang === "fr" ? "TVA" : "VAT"} : {business.vatNumber}<br /></>}
      </address>
    );
  };

  const formatHosting = () => {
    if (!business) return null;
    return (
      <p>
        {lang === "fr" ? "Le site est hébergé par" : "The site is hosted by"} {business.hostingProvider || (lang === "fr" ? "[À définir]" : "[To be defined]")}.
        {business.hostingAddress && <><br /><span className={styles.preLine}>{business.hostingAddress}</span></>}
      </p>
    );
  };

  const renderSectionContent = (section: LegalSection) => {
    if (section.id === "editor" || section.id === "identity" || section.id === "controller") {
      return formatIdentity();
    }
    if (section.id === "hosting") {
      return formatHosting();
    }
    if (section.id === "cookies-inventory") {
      if (!document.inventory || document.inventory.length === 0) {
        return <p>{lang === "fr" ? "Aucun cookie spécifique répertorié." : "No specific cookies listed."}</p>;
      }
      return (
        <div className={styles.tableWrapper}>
          <table>
            <thead>
              <tr>
                <th>{lang === "fr" ? "Nom" : "Name"}</th>
                <th>{lang === "fr" ? "Fournisseur" : "Provider"}</th>
                <th>{lang === "fr" ? "Catégorie" : "Category"}</th>
                <th>{lang === "fr" ? "Finalité" : "Purpose"}</th>
                <th>{lang === "fr" ? "Durée" : "Duration"}</th>
              </tr>
            </thead>
            <tbody>
              {document.inventory.map(cookie => (
                <tr key={cookie.id}>
                  <td>{cookie.name[lang]}</td>
                  <td>{cookie.provider[lang]}</td>
                  <td>{cookie.category}</td>
                  <td>{cookie.purpose[lang]}</td>
                  <td>{cookie.duration[lang]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    
    return (
      <>
        {section.paragraphs.map((p, i) => (
          <p key={i} className={styles.preLine}>{p[lang]}</p>
        ))}
        {section.listItems && section.listItems.length > 0 && (
          <ul>
            {section.listItems.map((li, i) => (
              <li key={i}>{li[lang]}</li>
            ))}
          </ul>
        )}
      </>
    );
  };

  return (
    <div className={styles.container}>
      <Header lang={lang} alternateLangHref={alternateLangHref} />
      <main className={styles.mainSection}>
        <div className={styles.wrapper}>
          <h1 className={styles.title}>{document.publicTitle[lang]}</h1>

          {showWarning && (
            <div className={styles.draftNotice}>
              {lang === "fr"
                ? "Ce document est en cours de finalisation et ne constitue pas un document juridique opposable."
                : "This document is being finalized and does not constitute a legally binding document."}
            </div>
          )}
          
          <div className={styles.metaInfo}>
            {document.effectiveDate ? (
              <p><em>{lang === "fr" ? "Date d'entrée en vigueur :" : "Effective date:"} {document.effectiveDate} (Version {document.version})</em></p>
            ) : (
              <p><em>{lang === "fr" ? "Brouillon non publié" : "Unpublished draft"}</em></p>
            )}
          </div>

          <div className={styles.content}>
            <p className={styles.preLine}>{document.intro[lang]}</p>

            {document.sections.map(section => (
              <div key={section.id}>
                <h2>{section.title[lang]}</h2>
                {renderSectionContent(section)}
              </div>
            ))}
            
            {document.inventory && !document.sections.some(s => s.id === "cookies-inventory") && (
              <div key="cookies-inventory">
                <h2>{lang === "fr" ? "Inventaire des cookies" : "Cookies inventory"}</h2>
                {renderSectionContent({ id: "cookies-inventory", title: {fr: "", en: ""}, paragraphs: [] })}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer lang={lang} />
    </div>
  );
}
