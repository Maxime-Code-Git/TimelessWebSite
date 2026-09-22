import {
  type ActionFunctionArgs,
} from "react-router";
import { Form, useNavigation } from "react-router";
import { useState, useRef } from "react";
import { requireValidAdminSession } from "../lib/admin-auth.server";
import { validateOrigin } from "../lib/security.server";
import {
  getRawSiteContent,
  saveAboutPageSettings,
  RevisionConflictError,
  ValidationError,
} from "../lib/site-content.server";
import type { AboutPageContent, HomeVariantInfo } from "../lib/site-content.server";
import styles from "./admin.module.css";
import React from "react";
import type { Route } from "./+types/admin.about";
import { prepareHomeImageDeletion, MediaTransactionError } from "../lib/home-media.server";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await requireValidAdminSession(request);
  const { content: siteContent, isCorrupted } = getRawSiteContent();

  return Response.json({
    csrfToken: session.get("csrfToken"),
    content: siteContent.aboutPage,
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

  const MAX_ADMIN_BODY_SIZE = 500 * 1024;
  let totalBytes = 0;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_ADMIN_BODY_SIZE) {
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

  const aboutDataStr = String(formData.get("aboutData") || "");
  const removedImagesStr = String(formData.get("removedImages") || "[]");

  let newAbout: AboutPageContent;
  let removedImagesRaw: unknown;
  try {
    newAbout = JSON.parse(aboutDataStr);
    removedImagesRaw = JSON.parse(removedImagesStr);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 422, headers });
  }

  if (!Array.isArray(removedImagesRaw) || removedImagesRaw.length > 2) {
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
    if (typeof section !== "string" || !["about-team"].includes(section)) {
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
    const newRevision = saveAboutPageSettings(newAbout, revision);

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

export default function AdminAbout({ loaderData, actionData }: Route.ComponentProps) {
  const data = loaderData as { content: AboutPageContent; revision: string; csrfToken: string; isCorrupted: boolean };
  const action = actionData as { success?: boolean; error?: string; newRevision?: string } | undefined;

  const isCorrupted = data.isCorrupted;

  const [content, setContent] = useState<AboutPageContent>(data.content);
  const [revision, setRevision] = useState(data.revision);
  const revisionRef = useRef(data.revision);
  const [removedImages, setRemovedImages] = useState<{section: string, imageId: string}[]>([]);
  const [isGlobalUploading, setIsGlobalUploading] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<{section: string, imageId: string, index?: number} | null>(null);

  React.useEffect(() => {
    if (action?.success && action.newRevision) {
      setRevision(action.newRevision);
      revisionRef.current = action.newRevision;
      setRemovedImages([]);
    }
  }, [action]);

  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting" || navigation.state === "loading";
  const disabled = isSubmitting || isGlobalUploading || isCorrupted;

  const [lang, setLang] = useState<"fr" | "en">("fr");

  const updateSeo = (updates: Partial<typeof content.seo>) => {
    setContent(prev => ({ ...prev, seo: { ...prev.seo, ...updates } }));
  };

  const updateHero = (updates: Partial<typeof content.hero>) => {
    setContent(prev => ({ ...prev, hero: { ...prev.hero, ...updates } }));
  };

  const updateTeamMember = (index: number, updates: Partial<typeof content.team.members[0]>) => {
    setContent(prev => {
      const newMembers = [...prev.team.members];
      newMembers[index] = { ...newMembers[index], ...updates };
      return { ...prev, team: { members: newMembers } };
    });
  };

  const updateDifference = (updates: Partial<typeof content.difference>) => {
    setContent(prev => ({ ...prev, difference: { ...prev.difference, ...updates } }));
  };

  const updatePrinciple = (id: string, updates: Partial<typeof content.approach.principles[0]>) => {
    setContent(prev => ({
      ...prev,
      approach: {
        ...prev.approach,
        principles: prev.approach.principles.map(p => p.id === id ? { ...p, ...updates } : p)
      }
    }));
  };

  const executeImageDelete = () => {
    if (!imageToDelete) return;
    const { section, imageId } = imageToDelete;

    setRemovedImages(prev => {
      if (prev.some(p => p.imageId === imageId)) return prev;
      return [...prev, { section, imageId }];
    });

    if (section === "about-team" && typeof imageToDelete.index === "number") {
      updateTeamMember(imageToDelete.index, { image: { imageId: null, variants: [], alt: content.team.members[imageToDelete.index].image.alt, width: 0, height: 0 } });
    }
    setImageToDelete(null);
  };

  return (
    <div className={styles.adminLayout}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1>Édition de la page À propos</h1>
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

        <Form method="post" id="aboutForm" className={styles.formSection}>
          <input type="hidden" name="csrfToken" value={data.csrfToken} />
          <input type="hidden" name="aboutData" value={JSON.stringify(content)} />
          <input type="hidden" name="removedImages" value={JSON.stringify(removedImages)} />
          <input type="hidden" name="revision" value={revisionRef.current} />

          <section className={`${styles.dashboardCard} ${styles.sectionCard}`}>
            <h2>SEO (Référencement)</h2>
            <div className={styles.formGroup}>
              <label htmlFor={`seo-title-${lang}`}>Titre SEO ({lang})</label>
              <input id={`seo-title-${lang}`}
                type="text"
                value={content.seo.title[lang]}
                onChange={(e) => updateSeo({ title: { ...content.seo.title, [lang]: e.target.value } })}
                disabled={disabled}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor={`seo-description-${lang}`}>Description SEO ({lang})</label>
              <textarea id={`seo-description-${lang}`}
                value={content.seo.description[lang]}
                onChange={(e) => updateSeo({ description: { ...content.seo.description, [lang]: e.target.value } })}
                disabled={disabled}
                className={styles.input}
                rows={3}
              />
            </div>
          </section>

          <section className={`${styles.dashboardCard} ${styles.sectionCard}`}>
            <h2>En-tête Hero</h2>
            <div className={styles.formGroup}>
              <label htmlFor={`hero-title-${lang}`}>Titre principal ({lang})</label>
              <input id={`hero-title-${lang}`}
                type="text"
                value={content.hero.title[lang]}
                onChange={(e) => updateHero({ title: { ...content.hero.title, [lang]: e.target.value } })}
                disabled={disabled}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor={`hero-subtitle-${lang}`}>Sous-titre ({lang})</label>
              <textarea id={`hero-subtitle-${lang}`}
                value={content.hero.subtitle[lang]}
                onChange={(e) => updateHero({ subtitle: { ...content.hero.subtitle, [lang]: e.target.value } })}
                disabled={disabled}
                className={styles.input}
                rows={3}
              />
            </div>
          </section>

          <section className={`${styles.dashboardCard} ${styles.sectionCard}`}>
            <h2>Notre différence</h2>
            <div className={styles.formGroup}>
              <label htmlFor={`diff-title-${lang}`}>Titre ({lang})</label>
              <input id={`diff-title-${lang}`}
                type="text"
                value={content.difference.title[lang]}
                onChange={(e) => updateDifference({ title: { ...content.difference.title, [lang]: e.target.value } })}
                disabled={disabled}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor={`diff-text-${lang}`}>Texte ({lang})</label>
              <textarea id={`diff-text-${lang}`}
                value={content.difference.text[lang]}
                onChange={(e) => updateDifference({ text: { ...content.difference.text, [lang]: e.target.value } })}
                disabled={disabled}
                className={styles.input}
                rows={4}
              />
            </div>
          </section>

          <section className={`${styles.dashboardCard} ${styles.sectionCard}`}>
            <h2>Notre approche</h2>
            <div className={styles.formGroup}>
              <label htmlFor={`approach-title-${lang}`}>Titre de la section ({lang})</label>
              <input id={`approach-title-${lang}`}
                type="text"
                value={content.approach.title[lang]}
                onChange={(e) => setContent(prev => ({ ...prev, approach: { ...prev.approach, title: { ...prev.approach.title, [lang]: e.target.value } } }))}
                disabled={disabled}
                className={styles.input}
              />
            </div>

            <div className={styles.grid}>
              {content.approach.principles.map((p) => (
                <div key={p.id} className={styles.card}>
                  <h3>{p.id === "discretion" ? "Discrétion" : p.id === "single-studio" ? "Un seul studio" : "Intemporel"}</h3>
                  <div className={styles.formGroup}>
                    <label htmlFor={`principle-${p.id}-title-${lang}`}>Titre ({lang})</label>
                    <input id={`principle-${p.id}-title-${lang}`}
                      type="text"
                      value={p.title[lang]}
                      onChange={(e) => updatePrinciple(p.id, { title: { ...p.title, [lang]: e.target.value } })}
                      disabled={disabled}
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor={`principle-${p.id}-text-${lang}`}>Texte ({lang})</label>
                    <textarea id={`principle-${p.id}-text-${lang}`}
                      value={p.text[lang]}
                      onChange={(e) => updatePrinciple(p.id, { text: { ...p.text, [lang]: e.target.value } })}
                      disabled={disabled}
                      className={styles.input}
                      rows={3}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={`${styles.dashboardCard} ${styles.sectionCard}`}>
            <h2>L'équipe</h2>
            {content.team.members.map((member, i) => (
              <div key={member.id} className={`${styles.grid} ${i === 0 ? styles.teamMemberGap : ""}`}>
                <div className={styles.card}>
                  <h3>Image ({member.id === "photographer" ? "Photographe" : "Vidéaste"})</h3>
                  <ImageUploader
                    csrfToken={data.csrfToken}
                    revision={revision}
                    section="about-team"
                    index={i}
                    currentImageId={member.image.imageId}
                    alt={member.image.alt?.[lang] || "Preview"}
                    _isGlobalUploading={isGlobalUploading}
                    setIsGlobalUploading={setIsGlobalUploading}
                    disabled={disabled}
                    onSuccess={(newRevision, newId, variants, width, height) => {
                      setRevision(newRevision);
                      revisionRef.current = newRevision;
                      updateTeamMember(i, { image: { ...member.image, imageId: newId, variants, width, height } });
                    }}
                    onDelete={() => {
                      if (member.image.imageId) { setImageToDelete({ section: "about-team", imageId: member.image.imageId as string, index: i }); }
                    }}
                  />
                  <div className={styles.marginTopSmall}>
                    <label htmlFor={`team-alt-${i}-${lang}`}>Texte alternatif ({lang})</label>
                    <input id={`team-alt-${i}-${lang}`}
                      type="text"
                      value={member.image.alt?.[lang] || ""}
                      onChange={(e) => updateTeamMember(i, { image: { ...member.image, alt: { ...member.image.alt, [lang]: e.target.value } } })}
                      className={styles.input}
                      disabled={disabled}
                    />
                  </div>
                </div>
                <div className={`${styles.formGroup} ${styles.flex1}`}>
                  <label htmlFor={`team-name-${i}-${lang}`}>Nom ({lang})</label>
                  <input id={`team-name-${i}-${lang}`}
                    type="text"
                    value={member.name[lang]}
                    onChange={(e) => updateTeamMember(i, { name: { ...member.name, [lang]: e.target.value } })}
                    className={styles.input}
                    disabled={disabled}
                  />
  
                  <label htmlFor={`team-role-${i}-${lang}`} className={styles.marginTopSmall}>Rôle ({lang})</label>
                  <input id={`team-role-${i}-${lang}`}
                    type="text"
                    value={member.role[lang]}
                    onChange={(e) => updateTeamMember(i, { role: { ...member.role, [lang]: e.target.value } })}
                    className={styles.input}
                    disabled={disabled}
                  />
  
                  <label htmlFor={`team-bio-${i}-${lang}`} className={styles.marginTopSmall}>Biographie ({lang})</label>
                  <textarea id={`team-bio-${i}-${lang}`}
                    value={member.bio[lang]}
                    onChange={(e) => updateTeamMember(i, { bio: { ...member.bio, [lang]: e.target.value } })}
                    className={styles.input}
                    rows={6}
                    disabled={disabled}
                  />
                </div>
              </div>
            ))}
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
              data-testid={`about-image-preview-${section}`}
              className={`${styles.photoImgCover} ${styles.aspect16_9}`}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className={`${styles.watermarkPreviewLight} ${styles.aspect16_9}`}>
              Image introuvable
            </div>
          )}
          <button type="button" onClick={() => { setUploadError(null); onDelete(); }} disabled={disabled} className={`${styles.button} ${styles.deleteButton}`}>
            Supprimer
          </button>
        </div>
      ) : (
        <div className={`${styles.watermarkPreviewLight} ${styles.aspect16_9}`}>
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
