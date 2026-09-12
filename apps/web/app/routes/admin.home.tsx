import {
  type ActionFunctionArgs,
} from "react-router";
import { Form, useNavigation } from "react-router";
import { useState, useRef } from "react";
import { requireValidAdminSession } from "../lib/admin-auth.server";
import { validateOrigin } from "../lib/security.server";
import {
  getRawSiteContent,
  saveHomeSettings,
  RevisionConflictError,
  ValidationError,
} from "../lib/site-content.server";
import type { HomeContent } from "../lib/site-content.server";
import styles from "./admin.module.css";
import React from "react";
import type { Route } from "./+types/admin.home";
import { prepareHomeImageDeletion, MediaTransactionError } from "../lib/home-media.server";
import type { HomeVariantInfo } from "../lib/site-content.server";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireValidAdminSession(request);
  const { content: siteContent, isCorrupted } = getRawSiteContent();

  return Response.json({
    csrfToken: session.get("csrfToken"),
    content: siteContent.home,
    revision: siteContent.revision,
    isCorrupted,
  }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function action({ request }: ActionFunctionArgs) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" };
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } });
  }

  const session = await requireValidAdminSession(request);
  if (!validateOrigin(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403, headers });
  }

  const contentType = request.headers.get("Content-Type") || "";
  const mimeType = contentType.split(";")[0]?.trim().toLowerCase();
  if (mimeType !== "application/x-www-form-urlencoded") {
    return Response.json({ error: "Unsupported Media Type" }, { status: 415, headers });
  }

  if (!request.body) {
    return Response.json({ error: "Empty body" }, { status: 400, headers });
  }

  const MAX_ADMIN_HOME_BODY_SIZE = 500 * 1024;
  let totalBytes = 0;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_ADMIN_HOME_BODY_SIZE) {
          await reader.cancel("Payload too large");
          return Response.json({ error: "Payload too large" }, { status: 413, headers });
        }
        chunks.push(value);
      }
    }
  } catch {
    return Response.json({ error: "Invalid body stream" }, { status: 400, headers });
  }

  const rawBody = Buffer.concat(chunks).toString("utf-8");
  const formData = new URLSearchParams(rawBody);

  const csrfToken = String(formData.get("csrfToken") || "");
  if (!csrfToken || csrfToken !== session.get("csrfToken")) {
    return Response.json({ error: "Invalid CSRF token" }, { status: 403, headers });
  }

  const revision = String(formData.get("revision") || "");
  if (!/^[0-9a-f]{32}$/.test(revision)) {
    return Response.json({ error: "Invalid revision format" }, { status: 400, headers });
  }

  const homeDataStr = String(formData.get("homeData") || "");
  const removedImagesStr = String(formData.get("removedImages") || "[]");

  let newHome: HomeContent;
  let removedImagesRaw: unknown;
  try {
    newHome = JSON.parse(homeDataStr);
    removedImagesRaw = JSON.parse(removedImagesStr);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 422, headers });
  }

  if (!Array.isArray(removedImagesRaw) || removedImagesRaw.length > 6) {
    return Response.json({ error: "Invalid removedImages format" }, { status: 422, headers });
  }

  const seenUUIDs = new Set<string>();
  const removedImages: { section: string, imageId: string }[] = [];
  for (const img of removedImagesRaw) {
    if (typeof img !== "object" || img === null) return Response.json({ error: "Invalid removedImages entry" }, { status: 422, headers });
    const keys = Object.keys(img);
    if (keys.length !== 2 || !keys.includes("section") || !keys.includes("imageId")) return Response.json({ error: "Invalid removedImages keys" }, { status: 422, headers });
    const section = (img as Record<string, unknown>).section;
    const imageId = (img as Record<string, unknown>).imageId;
    if (typeof section !== "string" || !["hero", "portfolio-photo", "portfolio-video", "studio"].includes(section)) {
      return Response.json({ error: "Invalid section" }, { status: 422, headers });
    }
    if (typeof imageId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(imageId)) {
      return Response.json({ error: "Invalid UUID" }, { status: 422, headers });
    }
    if (seenUUIDs.has(imageId)) {
      return Response.json({ error: "Duplicate UUID in removedImages" }, { status: 422, headers });
    }
    seenUUIDs.add(imageId);
    removedImages.push({ section, imageId });
  }

  const transactions = removedImages.map(img => prepareHomeImageDeletion(img.section, img.imageId));

  try {
    const newRevision = saveHomeSettings(newHome, revision);

    for (const tx of transactions) {
      tx.commit();
    }

    return Response.json({ success: true, newRevision }, { headers });
  } catch (error: unknown) {
    try {
      for (const tx of transactions) {
        tx.rollback();
      }
    } catch (e) {
      if (e instanceof MediaTransactionError) throw e;
      throw new MediaTransactionError("Rollback failed during multiple delete", { cause: e });
    }

    if (error instanceof RevisionConflictError) {
      return Response.json({ error: "Conflit de révision. Quelqu'un d'autre a modifié le contenu." }, { status: 409, headers });
    }
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 422, headers });
    }
    return Response.json({ error: "Erreur interne" }, { status: 500, headers });
  }
}

export default function AdminHome({ loaderData, actionData }: Route.ComponentProps) {
  const data = loaderData as { content: HomeContent; revision: string; csrfToken: string; isCorrupted: boolean };
  const action = actionData as { success?: boolean; error?: string; newRevision?: string } | undefined;

  const isCorrupted = data.isCorrupted;

  const [content, setContent] = useState<HomeContent>(data.content);
  const [revision, setRevision] = useState(data.revision);
  const revisionRef = useRef(data.revision);
  const [removedImages, setRemovedImages] = useState<{section: string, imageId: string}[]>([]);
  const [isGlobalUploading, setIsGlobalUploading] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<{section: string, imageId: string} | null>(null);

  // If we just successfully saved, we update revision from actionData
  React.useEffect(() => {
    if (action?.success && action.newRevision) {
      setRevision(action.newRevision);
      revisionRef.current = action.newRevision;
      setRemovedImages([]); // Vider removedImages après une sauvegarde réussie
    }
  }, [action]);

  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting" || navigation.state === "loading";
  const disabled = isSubmitting || isGlobalUploading || isCorrupted;

  const [lang, setLang] = useState<"fr" | "en">("fr");

  const updateHeroImage = (index: number, updates: Partial<typeof content.hero.images[0]>) => {
    setContent(prev => ({
      ...prev,
      hero: {
        ...prev.hero,
        images: prev.hero.images.map((img, i) => i === index ? { ...img, ...updates } : img)
      }
    }));
  };

  const updatePortfolioCard = (card: "photo" | "video", updates: Partial<typeof content.portfolioCards.photo>) => {
    setContent(prev => ({
      ...prev,
      portfolioCards: {
        ...prev.portfolioCards,
        [card]: { ...prev.portfolioCards[card], ...updates }
      }
    }));
  };

  const updateStudio = (updates: Partial<typeof content.studio>) => {
    setContent(prev => ({
      ...prev,
      studio: { ...prev.studio, ...updates }
    }));
  };

  const updateEditorial = (updates: Partial<typeof content.editorial>) => {
    setContent(prev => ({
      ...prev,
      editorial: { ...prev.editorial, ...updates }
    }));
  };

  const updatePricingPreview = (updates: Partial<typeof content.pricingPreview>) => {
    setContent(prev => ({
      ...prev,
      pricingPreview: { ...prev.pricingPreview, ...updates }
    }));
  };

  const handleHeroSwap = (index1: number, index2: number) => {
    setContent(prev => {
      const nextImages = [...prev.hero.images];
      const temp = nextImages[index1];
      nextImages[index1] = nextImages[index2];
      nextImages[index2] = temp;
      return { ...prev, hero: { ...prev.hero, images: nextImages } };
    });
  };

  const executeImageDelete = () => {
    if (!imageToDelete) return;
    const { section, imageId } = imageToDelete;

    setRemovedImages(prev => {
      if (prev.some(p => p.imageId === imageId)) return prev;
      return [...prev, { section, imageId }];
    });

    if (section === "hero") {
      const idx = content.hero.images.findIndex(img => img.imageId === imageId);
      if (idx !== -1) {
        updateHeroImage(idx, { imageId: null, variants: [], width: 0, height: 0 });
      }
    } else if (section === "portfolio-photo") {
      updatePortfolioCard("photo", { imageId: null, variants: [], width: 0, height: 0 });
    } else if (section === "portfolio-video") {
      updatePortfolioCard("video", { imageId: null, variants: [], width: 0, height: 0 });
    } else if (section === "studio") {
      updateStudio({ imageId: null, variants: [], width: 0, height: 0 });
    }
    setImageToDelete(null);
  };

  return (
    <div className={styles.adminLayout}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1>Édition de l'Accueil</h1>
          <div className={styles.headerActions}>
            <button type="button" onClick={() => setLang("fr")} className={lang === "fr" ? styles.activeLang : ""} disabled={disabled}>FR</button>
            <button type="button" onClick={() => setLang("en")} className={lang === "en" ? styles.activeLang : ""} disabled={disabled}>EN</button>
            <a href="/admin" className={styles.backLink} data-disabled={disabled ? "true" : undefined}>Retour au dashboard</a>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {action?.error && <div className={styles.errorAlert} role="alert">{action.error}</div>}
        {action?.success && <div className={styles.successAlert} role="status">Les modifications ont été enregistrées avec succès.</div>}

        <Form method="post" id="homeForm" className={styles.formSection}>
          <input type="hidden" name="csrfToken" value={data.csrfToken} />
          <input type="hidden" name="homeData" value={JSON.stringify(content)} />
          <input type="hidden" name="removedImages" value={JSON.stringify(removedImages)} />
          <input type="hidden" name="revision" value={revisionRef.current} />

          <section className={`${styles.dashboardCard} ${styles.sectionCard}`}>
            <h2>En-tête Hero</h2>
            <div className={styles.formGroup}>
              <label htmlFor={`hero-smallTitle-${lang}`}>Surtitre ({lang})</label>
              <input id={`hero-smallTitle-${lang}`}
                type="text"
                value={content.hero.smallTitle[lang]}
                onChange={(e) => setContent(prev => ({ ...prev, hero: { ...prev.hero, smallTitle: { ...prev.hero.smallTitle, [lang]: e.target.value } } }))}
                disabled={disabled}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor={`hero-largeTitle-${lang}`}>Titre principal ({lang})</label>
              <input id={`hero-largeTitle-${lang}`}
                type="text"
                value={content.hero.largeTitle[lang]}
                onChange={(e) => setContent(prev => ({ ...prev, hero: { ...prev.hero, largeTitle: { ...prev.hero.largeTitle, [lang]: e.target.value } } }))}
                disabled={disabled}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor={`hero-subtitle-${lang}`}>Sous-titre ({lang})</label>
              <input id={`hero-subtitle-${lang}`}
                type="text"
                value={content.hero.subtitle[lang]}
                onChange={(e) => setContent(prev => ({ ...prev, hero: { ...prev.hero, subtitle: { ...prev.hero.subtitle, [lang]: e.target.value } } }))}
                disabled={disabled}
                className={styles.input}
              />
            </div>

            <h3>Images Hero</h3>
            <div className={styles.grid}>
              {[0, 1, 2].map((i) => (
                <div key={i} className={`${styles.card} ${styles.photoItem}`}>
                  <h4>Slot {i + 1}</h4>
                  <ImageUploader
                    csrfToken={data.csrfToken}
                    revision={revision}
                    section="hero"
                    index={i}
                    currentImageId={content.hero.images[i].imageId}
                    alt={content.hero.images[i].alt[lang] || "Preview"}
                    _isGlobalUploading={isGlobalUploading}
                    setIsGlobalUploading={setIsGlobalUploading}
                    disabled={disabled}
                    onSuccess={(newRevision, newId, variants, width, height) => {
                      setRevision(newRevision);
                      revisionRef.current = newRevision;
                      updateHeroImage(i, { imageId: newId, variants, width, height });
                    }}
                    onDelete={() => {
                      if (content.hero.images[i].imageId) { setImageToDelete({ section: "hero", imageId: content.hero.images[i].imageId as string }); }
                    }}
                  />
                  <div className={styles.marginTopSmall}>
                    <label htmlFor={`hero-image-${i}-alt-${lang}`}>Alt text ({lang})</label>
                    <input id={`hero-image-${i}-alt-${lang}`}
                      type="text"
                      value={content.hero.images[i].alt[lang] || ""}
                      onChange={(e) => updateHeroImage(i, { alt: { ...content.hero.images[i].alt, [lang]: e.target.value } })}
                      className={styles.input}
                      disabled={disabled}
                    />
                  </div>
                  <div className={styles.photoActionsRow}>
                    <button type="button" onClick={() => handleHeroSwap(i, Math.max(0, i - 1))} disabled={disabled || i === 0}>←</button>
                    <button type="button" onClick={() => handleHeroSwap(i, Math.min(2, i + 1))} disabled={disabled || i === 2}>→</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={`${styles.dashboardCard} ${styles.sectionCard}`}>
            <h2>Éditorial</h2>
            <div className={styles.formGroup}>
              <label htmlFor={`editorial-paragraph-${lang}`}>Paragraphe ({lang})</label>
              <textarea id={`editorial-paragraph-${lang}`}
                value={content.editorial.paragraph[lang]}
                onChange={(e) => updateEditorial({ paragraph: { ...content.editorial.paragraph, [lang]: e.target.value } })}
                className={styles.input}
                rows={3}
                disabled={disabled}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor={`editorial-highlight-${lang}`}>Mise en évidence ({lang})</label>
              <input id={`editorial-highlight-${lang}`}
                type="text"
                value={content.editorial.highlight[lang]}
                onChange={(e) => updateEditorial({ highlight: { ...content.editorial.highlight, [lang]: e.target.value } })}
                className={styles.input}
                disabled={disabled}
              />
            </div>
          </section>

          <section className={`${styles.dashboardCard} ${styles.sectionCard}`}>
            <h2>Cartes Portfolio</h2>
            <div className={styles.grid}>
              <div className={styles.card}>
                <h3>Photographie</h3>
                <ImageUploader
                  csrfToken={data.csrfToken}
                  revision={revision}
                  section="portfolio-photo"
                  currentImageId={content.portfolioCards.photo.imageId}
                  alt={content.portfolioCards.photo.alt?.[lang] || "Preview"}
                  _isGlobalUploading={isGlobalUploading}
                  setIsGlobalUploading={setIsGlobalUploading}
                  disabled={disabled}
                  onSuccess={(newRevision, newId, variants, width, height) => {
                    setRevision(newRevision);
                    revisionRef.current = newRevision;
                    updatePortfolioCard("photo", { imageId: newId, variants, width, height });
                  }}
                  onDelete={() => {
                    if (content.portfolioCards.photo.imageId) { setImageToDelete({ section: "portfolio-photo", imageId: content.portfolioCards.photo.imageId as string }); }
                  }}
                />
                <div className={styles.marginTopSmall}>
                  <label htmlFor={`photo-alt-${lang}`}>Alt text ({lang})</label>
                  <input id={`photo-alt-${lang}`}
                    type="text"
                    value={content.portfolioCards.photo.alt?.[lang] || ""}
                    onChange={(e) => updatePortfolioCard("photo", { alt: { ...content.portfolioCards.photo.alt, [lang]: e.target.value } })}
                    className={styles.input}
                    disabled={disabled}
                  />
                  <label htmlFor={`photo-title-${lang}`} className={styles.marginTopSmall}>Titre ({lang})</label>
                  <input id={`photo-title-${lang}`}
                    type="text"
                    value={content.portfolioCards.photo.title[lang]}
                    onChange={(e) => updatePortfolioCard("photo", { title: { ...content.portfolioCards.photo.title, [lang]: e.target.value } })}
                    className={styles.input}
                    disabled={disabled}
                  />
                  <label htmlFor={`photo-subtitle-${lang}`} className={styles.marginTopSmall}>Sous-titre ({lang})</label>
                  <input id={`photo-subtitle-${lang}`}
                    type="text"
                    value={content.portfolioCards.photo.subtitle[lang]}
                    onChange={(e) => updatePortfolioCard("photo", { subtitle: { ...content.portfolioCards.photo.subtitle, [lang]: e.target.value } })}
                    className={styles.input}
                    disabled={disabled}
                  />
                </div>
              </div>
              <div className={styles.card}>
                <h3>Film</h3>
                <ImageUploader
                  csrfToken={data.csrfToken}
                  revision={revision}
                  section="portfolio-video"
                  currentImageId={content.portfolioCards.video.imageId}
                  alt={content.portfolioCards.video.alt?.[lang] || "Preview"}
                  _isGlobalUploading={isGlobalUploading}
                  setIsGlobalUploading={setIsGlobalUploading}
                  disabled={disabled}
                  onSuccess={(newRevision, newId, variants, width, height) => {
                    setRevision(newRevision);
                    revisionRef.current = newRevision;
                    updatePortfolioCard("video", { imageId: newId, variants, width, height });
                  }}
                  onDelete={() => {
                    if (content.portfolioCards.video.imageId) { setImageToDelete({ section: "portfolio-video", imageId: content.portfolioCards.video.imageId as string }); }
                  }}
                />
                <div className={styles.marginTopSmall}>
                  <label htmlFor={`video-alt-${lang}`}>Alt text ({lang})</label>
                  <input id={`video-alt-${lang}`}
                    type="text"
                    value={content.portfolioCards.video.alt?.[lang] || ""}
                    onChange={(e) => updatePortfolioCard("video", { alt: { ...content.portfolioCards.video.alt, [lang]: e.target.value } })}
                    className={styles.input}
                    disabled={disabled}
                  />
                  <label htmlFor={`video-title-${lang}`} className={styles.marginTopSmall}>Titre ({lang})</label>
                  <input id={`video-title-${lang}`}
                    type="text"
                    value={content.portfolioCards.video.title[lang]}
                    onChange={(e) => updatePortfolioCard("video", { title: { ...content.portfolioCards.video.title, [lang]: e.target.value } })}
                    className={styles.input}
                    disabled={disabled}
                  />
                  <label htmlFor={`video-subtitle-${lang}`} className={styles.marginTopSmall}>Sous-titre ({lang})</label>
                  <input id={`video-subtitle-${lang}`}
                    type="text"
                    value={content.portfolioCards.video.subtitle[lang]}
                    onChange={(e) => updatePortfolioCard("video", { subtitle: { ...content.portfolioCards.video.subtitle, [lang]: e.target.value } })}
                    className={styles.input}
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className={`${styles.dashboardCard} ${styles.sectionCard}`}>
            <h2>Présentation Formules</h2>
            <div className={styles.grid}>
              <div className={styles.formGroup}>
                <label htmlFor={`pricingPreview-sectionTitle-${lang}`}>Titre de section ({lang})</label>
                <input id={`pricingPreview-sectionTitle-${lang}`}
                  type="text"
                  value={content.pricingPreview.sectionTitle[lang]}
                  onChange={(e) => updatePricingPreview({ sectionTitle: { ...content.pricingPreview.sectionTitle, [lang]: e.target.value } })}
                  className={styles.input}
                  disabled={disabled}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor={`pricingPreview-buttonText-${lang}`}>Bouton ({lang})</label>
                <input id={`pricingPreview-buttonText-${lang}`}
                  type="text"
                  value={content.pricingPreview.buttonText[lang]}
                  onChange={(e) => updatePricingPreview({ buttonText: { ...content.pricingPreview.buttonText, [lang]: e.target.value } })}
                  className={styles.input}
                  disabled={disabled}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor={`pricingPreview-promoText-${lang}`}>Texte Promo ({lang})</label>
                <input id={`pricingPreview-promoText-${lang}`}
                  type="text"
                  value={content.pricingPreview.promoText[lang]}
                  onChange={(e) => updatePricingPreview({ promoText: { ...content.pricingPreview.promoText, [lang]: e.target.value } })}
                  className={styles.input}
                  disabled={disabled}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor={`pricingPreview-promoTextBold-${lang}`}>Texte Promo Gras ({lang})</label>
                <input id={`pricingPreview-promoTextBold-${lang}`}
                  type="text"
                  value={content.pricingPreview.promoTextBold[lang]}
                  onChange={(e) => updatePricingPreview({ promoTextBold: { ...content.pricingPreview.promoTextBold, [lang]: e.target.value } })}
                  className={styles.input}
                  disabled={disabled}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor={`pricingPreview-caveat-${lang}`}>Avertissement Promo ({lang})</label>
                <input id={`pricingPreview-caveat-${lang}`}
                  type="text"
                  value={content.pricingPreview.caveat[lang]}
                  onChange={(e) => updatePricingPreview({ caveat: { ...content.pricingPreview.caveat, [lang]: e.target.value } })}
                  className={styles.input}
                  disabled={disabled}
                />
              </div>













              <div className={styles.formGroup}>
                <label htmlFor={`pricingPreview-customFormulaText-${lang}`}>Formule Sur-Mesure ({lang})</label>
                <input id={`pricingPreview-customFormulaText-${lang}`}
                  type="text"
                  value={content.pricingPreview.customFormulaText[lang]}
                  onChange={(e) => updatePricingPreview({ customFormulaText: { ...content.pricingPreview.customFormulaText, [lang]: e.target.value } })}
                  className={styles.input}
                  disabled={disabled}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor={`pricingPreview-customFormulaTextEm-${lang}`}>Formule Sur-Mesure Focus ({lang})</label>
                <input id={`pricingPreview-customFormulaTextEm-${lang}`}
                  type="text"
                  value={content.pricingPreview.customFormulaTextEm[lang]}
                  onChange={(e) => updatePricingPreview({ customFormulaTextEm: { ...content.pricingPreview.customFormulaTextEm, [lang]: e.target.value } })}
                  className={styles.input}
                  disabled={disabled}
                />
              </div>
            </div>
          </section>

          <section className={`${styles.dashboardCard} ${styles.sectionCard}`}>
            <h2>Studio</h2>
            <div className={styles.grid}>
              <div className={styles.card}>
                <h3>Image Studio</h3>
                <ImageUploader
                  csrfToken={data.csrfToken}
                  revision={revision}
                  section="studio"
                  currentImageId={content.studio.imageId}
                  alt={content.studio.alt?.[lang] || "Preview"}
                  _isGlobalUploading={isGlobalUploading}
                  setIsGlobalUploading={setIsGlobalUploading}
                  disabled={disabled}
                  onSuccess={(newRevision, newId, variants, width, height) => {
                    setRevision(newRevision);
                    revisionRef.current = newRevision;
                    updateStudio({ imageId: newId, variants, width, height });
                  }}
                  onDelete={() => {
                    if (content.studio.imageId) { setImageToDelete({ section: "studio", imageId: content.studio.imageId as string }); }
                  }}
                />
                <div className={styles.marginTopSmall}>
                  <label htmlFor={`studio-alt-${lang}`}>Alt text ({lang})</label>
                  <input id={`studio-alt-${lang}`}
                    type="text"
                    value={content.studio.alt?.[lang] || ""}
                    onChange={(e) => updateStudio({ alt: { ...content.studio.alt, [lang]: e.target.value } })}
                    className={styles.input}
                    disabled={disabled}
                  />
                </div>
              </div>
              <div className={`${styles.formGroup} ${styles.flex1}`}>
                <label htmlFor={`studio-title-${lang}`}>Titre ({lang})</label>
                <input id={`studio-title-${lang}`}
                  type="text"
                  value={content.studio.title[lang]}
                  onChange={(e) => updateStudio({ title: { ...content.studio.title, [lang]: e.target.value } })}
                  className={styles.input}
                  disabled={disabled}
                />
                <label htmlFor={`studio-description-${lang}`} className={styles.marginTopSmall}>Description ({lang})</label>
                <textarea id={`studio-description-${lang}`}
                  value={content.studio.description[lang]}
                  onChange={(e) => updateStudio({ description: { ...content.studio.description, [lang]: e.target.value } })}
                  className={styles.input}
                  rows={6}
                  disabled={disabled}
                />
              </div>
            </div>
          </section>

          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={disabled}
              title={isCorrupted ? "Sauvegarde désactivée (fichier corrompu)" : ""}
            >
              {isSubmitting ? "Sauvegarde..." : (isGlobalUploading ? "Upload en cours..." : "Enregistrer les textes et métadonnées")}
            </button>
          </div>
        </Form>
      </main>
      {imageToDelete && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className={styles.modalContent}>
            <h2 id="modal-title">Confirmation de suppression</h2>
            <p>Êtes-vous sûr de vouloir supprimer cette image ?</p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.button} onClick={() => setImageToDelete(null)}>Annuler</button>
              <button type="button" className={`${styles.button} ${styles.deleteButton}`} onClick={executeImageDelete}>
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageUploader({
  csrfToken,
  revision,
  section,
  index,
  currentImageId,
  alt,
  _isGlobalUploading,
  setIsGlobalUploading,
  onSuccess,
  onDelete,
  disabled
}: {
  csrfToken: string,
  revision: string,
  section: string,
  index?: number,
  currentImageId: string | null,
  alt: string,
  _isGlobalUploading: boolean,
  setIsGlobalUploading: (val: boolean) => void,
  onSuccess: (newRevision: string, newImageId: string, variants: HomeVariantInfo[], width: number, height: number) => void,
  onDelete: () => void,
  disabled?: boolean
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (disabled) return;
    setUploadError(null);
    setImgError(false);

    const formData = new FormData();
    formData.append("file", file);

    const headers: Record<string, string> = {
      "x-csrf-token": csrfToken,
      "x-home-revision": revision,
      "x-home-section": section,
    };
    if (index !== undefined) {
      headers["x-home-index"] = String(index);
    }

    setIsUploading(true);
    setIsGlobalUploading(true);

    try {
      const res = await fetch("/api/admin/home-image", {
        method: "POST",
        body: formData,
        headers,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (!Array.isArray(data.variants)) throw new Error("Invalid response");
        onSuccess(data.newRevision, data.imageId, data.variants, data.width, data.height);
      } else {
        setUploadError(data.error || "Erreur lors de l'upload");
      }
    } catch {
      setUploadError("Erreur de connexion lors de l'upload.");
    } finally {
      setIsUploading(false);
      setIsGlobalUploading(false);
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const file = e.target.files?.[0];
    if (file) {
      void handleUpload(file);
    }
    // reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className={styles.flexColumnGap}>
      {uploadError && <div className={styles.errorAlert} role="alert">{uploadError}</div>}
      {currentImageId ? (
        <div>
          {!imgError ? (
            <img
              src={`/media/home/${section}/${currentImageId}/640p/webp`}
              alt={alt}
              data-testid={`home-image-preview-${section}-${index ?? 0}`}
              className={section === "hero" ? `${styles.photoImgCover} ${styles.aspectHero}` : `${styles.photoImgCover} ${styles.aspect16_9}`}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className={section === "hero" ? `${styles.watermarkPreviewLight} ${styles.aspectHero}` : `${styles.watermarkPreviewLight} ${styles.aspect16_9}`}>
              Image introuvable
            </div>
          )}
          <button type="button" onClick={() => { setUploadError(null); onDelete(); }} disabled={disabled} className={`${styles.button} ${styles.deleteButton}`}>
            Supprimer
          </button>
        </div>
      ) : (
        <div className={section === "hero" ? `${styles.watermarkPreviewLight} ${styles.aspectHero}` : `${styles.watermarkPreviewLight} ${styles.aspect16_9}`}>
          Aucune image
        </div>
      )}

      {isUploading ? (
        <div className={styles.previewDesc}>
          Traitement de l’image…
        </div>
      ) : (
        <div>
          <input
            type="file"
            accept="image/jpeg, image/png, image/webp"
            ref={fileInputRef}
            onChange={onFileInputChange}
            className={styles.hidden}
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={styles.button}
            disabled={disabled}
          >
            {currentImageId ? "Remplacer l'image" : "Ajouter une image"}
          </button>
        </div>
      )}
    </div>
  );
}
