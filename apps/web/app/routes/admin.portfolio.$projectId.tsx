import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect
} from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import { assertPortfolioRevision, getProjectById, getPortfolioContent, updateProjectMetadata, publishProject, unpublishProject, setProjectCover, trashPhoto, updatePhotoMetadata, reorderProjectPhotos } from "../lib/portfolio-content.server";
import { parseVideoUrl, getCanonicalVideoUrl } from "../lib/video";
import type { Project } from "../lib/portfolio-content.server";
import { requireValidAdminSession, validateAdminFormData, ActionSecurityError } from "../lib/admin-auth.server";
import { RevisionConflictError, CorruptedContentError, ValidationError } from "../lib/site-content.server";
import styles from "./admin.module.css";
import * as crypto from "node:crypto";
import { commitSession } from "../lib/session.server";
import { useState, useEffect, useRef } from "react";
import { z } from "zod";

import { getPortfolioMediaPath } from "../lib/portfolio-content.server";
import { trashPhotoMedia, restorePhotoMedia } from "../lib/portfolio-image.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const session = await requireValidAdminSession(request);
  const projectId = params.projectId;
  if (!projectId) throw new Response("Not Found", { status: 404 });

  const project = getProjectById(projectId);
  if (!project) throw new Response("Not Found", { status: 404 });

  let csrfToken = session.get("csrfToken");
  const headers = new Headers();
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    session.set("csrfToken", csrfToken);
    headers.set("Set-Cookie", await commitSession(session));
  }

  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");

  const revision = getPortfolioContent().revision;

  return Response.json({ project, csrfToken, revision }, { headers });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");

  const projectId = params.projectId;
  if (!projectId) return Response.json({ error: "Not Found" }, { status: 404, headers });

  let formData: FormData;
  try {
    formData = await validateAdminFormData(request);
  } catch (err: unknown) {
    if (err instanceof ActionSecurityError) {
      return Response.json({ error: err.message }, { status: err.status, headers });
    }
    return Response.json({ error: "Bad Request" }, { status: 400, headers });
  }

  const previousRevision = formData.get("revision");
  if (typeof previousRevision !== "string") return Response.json({ error: "Invalid revision" }, { status: 422, headers });

  const intent = formData.get("intent");

  try {
    if (intent === "publish") {
      publishProject(projectId, previousRevision);
      return redirect(`/admin/portfolio`, { headers });
    }

    if (intent === "unpublish") {
      unpublishProject(projectId, previousRevision);
      return redirect(`/admin/portfolio`, { headers });
    }

    if (intent === "setCover") {
      const photoId = formData.get("photoId") as string;
      setProjectCover(projectId, photoId, previousRevision);
      return Response.json({ success: true }, { headers });
    }

    if (intent === "updatePhoto") {
      const photoId = formData.get("photoId") as string;
      const category = formData.get("category") as "ceremony" | "portraits" | "reception";
      const altFr = formData.get("altFr") as string;
      const altEn = formData.get("altEn") as string;
      updatePhotoMetadata(projectId, photoId, { category, alt: { fr: altFr, en: altEn } }, previousRevision);
      return Response.json({ success: true }, { headers });
    }

    if (intent === "reorderPhotos") {
      const photoIds = JSON.parse(formData.get("photoIds") as string);
      reorderProjectPhotos(projectId, photoIds, previousRevision);
      return Response.json({ success: true }, { headers });
    }

    if (intent === "trashPhoto") {
      const photoId = formData.get("photoId") as string;
      const project = getProjectById(projectId);
      if (!project) throw new Error("Project not found");
      const photo = project.photos.find(p => p.id === photoId);
      if (!photo) throw new Error("Photo not found");

      const mediaPath = getPortfolioMediaPath();

      // Refuse stale requests before moving any media.
      assertPortfolioRevision(previousRevision);

      // 1. Move media to trash
      trashPhotoMedia(projectId, mediaPath, photo);

      try {
        // 2. Commit metadata change
        trashPhoto(projectId, photoId, previousRevision);
      } catch (err) {
        // 3. Rollback media if metadata commit fails
        restorePhotoMedia(projectId, mediaPath, photo);
        throw err;
      }
      return Response.json({ success: true }, { headers });
    }

    if (!intent || intent === "update") {
      const titleFr = formData.get("titleFr") as string;
      const titleEn = formData.get("titleEn") as string;
      const slugFr = formData.get("slugFr") as string;
      const slugEn = formData.get("slugEn") as string;
      const descriptionFr = formData.get("descriptionFr") as string;
      const descriptionEn = formData.get("descriptionEn") as string;
      const location = formData.get("location") as string;
      const date = formData.get("date") as string;
      const videoUrl = formData.get("videoUrl") as string;

      if (!titleFr || !titleEn || !descriptionFr || !descriptionEn) {
        return Response.json({ error: "Missing required fields" }, { status: 422, headers });
      }

      let video: { provider: "youtube" | "vimeo"; videoId: string } | null = null;
      if (videoUrl?.trim()) {
        const parsed = parseVideoUrl(videoUrl.trim());
        if (!parsed) {
          return Response.json({ fieldErrors: { videoUrl: "L'URL fournie n'est pas une vidéo YouTube ou Vimeo valide." } }, { status: 422, headers });
        }
        video = parsed;
      }

      updateProjectMetadata(projectId, {
        title: { fr: titleFr, en: titleEn },
        slug: { fr: slugFr || "", en: slugEn || "" },
        description: { fr: descriptionFr, en: descriptionEn },
        location: location?.trim() ? location : null,
        date: date?.trim() ? date : null,
        video,
      }, previousRevision);

      return Response.json({ success: true }, { headers });
    }

    return Response.json({ error: "Unknown intent" }, { status: 400, headers });

  } catch (err: unknown) {
    if (err instanceof RevisionConflictError) {
      return Response.json({ error: "Revision conflict" }, { status: 409, headers });
    }
    if (err instanceof CorruptedContentError) {
      return Response.json({ error: "Corrupted content" }, { status: 409, headers });
    }
    if (err instanceof ValidationError) {
      return Response.json({ error: err.message }, { status: 422, headers });
    }
    if (err instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const pathStr = issue.path.join(".");
        if (pathStr.includes("projects")) {
           const parts = issue.path.slice(2);
           fieldErrors[parts.join(".")] = issue.message;
        }
      }
      return Response.json({ fieldErrors }, { status: 422, headers });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("is already used")) {
      if (msg.includes("FR slug")) return Response.json({ fieldErrors: { "slug.fr": msg } }, { status: 422, headers });
      if (msg.includes("EN slug")) return Response.json({ fieldErrors: { "slug.en": msg } }, { status: 422, headers });
    }
    return Response.json({ error: "Internal Server Error" }, { status: 500, headers });
  }
}

function generateClientSlug(text: string): string {
  let slug = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length > 100) {
    slug = slug.substring(0, 100).replace(/-+$/, "");
  }
  return slug;
}

function DraggablePhoto({
  photo, projectId, isCover, onSaveEdit, onDelete, onSetCover, onMoveUp, onMoveDown,
  disabled, isFirst, isLast, index, onReorder
}: {
  photo: Project["photos"][0], projectId: string, isCover: boolean,
  onSaveEdit: (cat: "ceremony" | "portraits" | "reception", altFr: string, altEn: string) => void, onDelete: () => void, onSetCover: () => void,
  onMoveUp: () => void, onMoveDown: () => void, disabled: boolean,
  isFirst: boolean, isLast: boolean, index: number,
  onReorder: (fromIndex: number, toIndex: number) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editCat, setEditCat] = useState(photo.category);
  const [editAltFr, setEditAltFr] = useState(photo.alt.fr);
  const [editAltEn, setEditAltEn] = useState(photo.alt.en);

  const previewVariant = photo.variants.find((v: Project["photos"][0]["variants"][0]) => v.name === "480p");
  const imgUrl = previewVariant ? `/admin/portfolio/media/${projectId}/${photo.id}/480p` : "";

  return (
    <div
      className={`${styles.photoCard} ${isDragOver ? styles.dragOver : ""}`}
      draggable={!disabled && !isEditing}
      onDragStart={(e) => {
        if (disabled || isEditing) return e.preventDefault();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/json", JSON.stringify({ index, projectId }));
      }}
      onDragOver={(e) => {
        if (disabled || isEditing) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={() => !disabled && !isEditing && setIsDragOver(true)}
      onDragLeave={() => !disabled && !isEditing && setIsDragOver(false)}
      onDrop={(e) => {
        setIsDragOver(false);
        if (disabled || isEditing) return;
        try {
          const data = JSON.parse(e.dataTransfer.getData("application/json"));
          if (data.projectId !== projectId || typeof data.index !== "number") return;
          if (data.index !== index) onReorder(data.index, index);
        } catch {
          // ignore invalid drop data
        }
      }}
    >
      <div className={styles.photoDragHandle}>≡</div>
      <img src={imgUrl} alt={photo.alt.fr} className={styles.photoImg} />
      <div className={styles.photoMeta}>
        {isEditing ? (
          <div className={styles.flexColumnGap}>
            <select value={editCat} onChange={e => setEditCat(e.target.value as "ceremony" | "portraits" | "reception")} className={styles.input}>
              <option value="ceremony">Cérémonie</option>
              <option value="portraits">Portraits</option>
              <option value="reception">Réception</option>
            </select>
            <input type="text" value={editAltFr} onChange={e => setEditAltFr(e.target.value)} placeholder="Alt FR" className={styles.input} />
            <input type="text" value={editAltEn} onChange={e => setEditAltEn(e.target.value)} placeholder="Alt EN" className={styles.input} />
            <div className={styles.photoActions}>
              <button type="button" onClick={() => { onSaveEdit(editCat, editAltFr, editAltEn); setIsEditing(false); }} className={styles.submitButton}>Enregistrer</button>
              <button type="button" onClick={() => { setIsEditing(false); setEditCat(photo.category); setEditAltFr(photo.alt.fr); setEditAltEn(photo.alt.en); }} className={styles.secondaryButton}>Annuler</button>
            </div>
          </div>
        ) : (
          <>
            <p><strong>{photo.category}</strong></p>
            <p>{photo.alt.fr || "Aucun alt"}</p>
            <div className={styles.photoActions}>
              <button type="button" onClick={() => setIsEditing(true)} disabled={disabled}>Modifier</button>
              {!isCover && <button type="button" onClick={onSetCover} disabled={disabled}>Couverture</button>}
              {isCover && <span className={styles.coverBadge}>Couverture</span>}
              <button type="button" onClick={onMoveUp} disabled={disabled || isFirst} title="Monter" aria-label="Monter">&uarr;</button>
              <button type="button" onClick={onMoveDown} disabled={disabled || isLast} title="Descendre" aria-label="Descendre">&darr;</button>
              <button type="button" onClick={onDelete} disabled={disabled} className={styles.deleteButton}>Supprimer</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminPortfolioEdit() {
  const { project, csrfToken, revision: loaderRevision } = useLoaderData() as unknown as { project: Project; csrfToken: string; revision: string };
  const [localRevision, setLocalRevision] = useState(loaderRevision);
  const revisionRef = useRef(loaderRevision);

  // Sync localRevision if loader data changes
  useEffect(() => {
    revisionRef.current = loaderRevision;
    setLocalRevision(loaderRevision);
  }, [loaderRevision]);
  const actionData = useActionData<{ error?: string, fieldErrors?: Record<string, string>, success?: boolean }>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";

  const [titleFr, setTitleFr] = useState(project.title.fr);
  const [titleEn, setTitleEn] = useState(project.title.en);

  const [isCustomSlug, setIsCustomSlug] = useState(false);
  const [slugFr, setSlugFr] = useState(project.slug.fr);
  const [slugEn, setSlugEn] = useState(project.slug.en);

  const derivedSlugFr = generateClientSlug(isCustomSlug ? slugFr : project.slug.fr);
  const derivedSlugEn = generateClientSlug(isCustomSlug ? slugEn : project.slug.en);

  // Upload Queue State
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ percentage: number, status: "uploading" | "processing" | "done" } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const isReadOnly = project.status === "published";
  const currentUploadFile = uploadQueue[0] ?? null;

  const handleFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    if (uploading || uploadQueue.length > 0) {
      alert("Un lot est déjà en cours d'envoi.");
      return;
    }
    const toAdd = Array.from(files).filter(f => ["image/jpeg", "image/png", "image/webp"].includes(f.type));
    if (uploadQueue.length + toAdd.length > 20) {
      alert("Maximum 20 fichiers par lot.");
      return;
    }
    const large = toAdd.find(f => f.size > 50 * 1024 * 1024);
    if (large) {
      alert("La taille maximum par fichier est de 50 MB.");
      return;
    }
    setUploadQueue(prev => [...prev, ...toAdd]);
  };

  useEffect(() => {
    if (!currentUploadFile || navigation.state !== "idle" || uploadError) return;

    const file = currentUploadFile;
    setUploading(true);
    setUploadProgress({ percentage: 0, status: "uploading" });

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", `/admin/portfolio/${project.id}/upload`, true);
    xhr.setRequestHeader("x-csrf-token", csrfToken);
    xhr.setRequestHeader("x-portfolio-revision", revisionRef.current);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentage = Math.round((event.loaded * 100) / event.total);
        if (percentage === 100) {
          setUploadProgress({ percentage: 100, status: "processing" });
        } else {
          setUploadProgress({ percentage, status: "uploading" });
        }
      }
    };

    xhr.onload = () => {
      if (xhrRef.current === xhr) xhrRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          if (typeof json.newRevision === "string") {
            revisionRef.current = json.newRevision;
            setLocalRevision(json.newRevision);
          }
        } catch {
          // ignore parse errors
        }
        setUploadProgress({ percentage: 100, status: "done" });
        setUploadQueue(q => q.slice(1));
        setUploading(false);
        // If this is the last file, trigger a full reload to show the photos
        if (uploadQueue.length === 1) {
          submit(null, { method: "get", action: `/admin/portfolio/${project.id}` });
        }
      } else {
        let msg = "Erreur inconnue";
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch { /* use the generic message */ }
        setUploadError(`Erreur sur ${file.name}: ${msg}`);
        setUploading(false);
      }
    };

    xhr.onerror = () => {
      if (xhrRef.current === xhr) xhrRef.current = null;
      setUploadError(`Erreur réseau lors de l'envoi de ${file.name}`);
      setUploading(false);
    };

    xhr.onabort = () => {
      if (xhrRef.current === xhr) xhrRef.current = null;
      setUploading(false);
    };

    xhr.send(formData);

    return () => {
      if (xhrRef.current === xhr && xhr.readyState !== XMLHttpRequest.DONE) {
        xhr.abort();
      }
    };
  }, [currentUploadFile, csrfToken, project.id, submit, navigation.state, uploadError]);

  const handleReorder = (fromIndex: number, toIndex: number) => {
    const ids = project.photos.map((p: Project["photos"][0]) => p.id);
    const reordered = [...ids];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const fd = new FormData();
    fd.append("intent", "reorderPhotos");
    fd.append("photoIds", JSON.stringify(reordered));
    fd.append("csrfToken", csrfToken);
    fd.append("revision", localRevision);
    submit(fd, { method: "post" });
  };

  // Publish checklist
  const isPublishable =
    project.title.fr && project.title.en &&
    project.description.fr && project.description.en &&
    project.slug.fr && project.slug.en &&
    project.photos.length > 0 && project.coverPhotoId &&
    project.photos.every((p: Project["photos"][0]) => p.category && p.alt.fr && p.alt.en);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>Modifier le Projet</h1>
          <p className={styles.headerSubtitle}>{project.title.fr}</p>
        </div>
        <div className={styles.headerActions}>
          <Form method="post">
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="revision" value={localRevision} />
            {project.status === "draft" ? (
              <button
                type="submit"
                name="intent"
                value="publish"
                disabled={!isPublishable || isSubmitting}
                className={`${styles.submitButton} ${isPublishable ? styles.btnSuccess : styles.btnSecondary}`}
              >
                Publier le projet
              </button>
            ) : (
              <button
                type="submit"
                name="intent"
                value="unpublish"
                disabled={isSubmitting}
                className={styles.secondaryButton}
              >
                Repasser en brouillon
              </button>
            )}
          </Form>
          <Link to="/admin/portfolio" className={`${styles.logoutButton} ${styles.noDecoration}`}>
            Retour
          </Link>
          {project.status === "published" && (
            <>
              <Link to={`/fr/portfolio/${project.slug.fr}`} className={`${styles.actionButton} ${styles.noDecoration}`}>
                Voir FR
              </Link>
              <Link to={`/en/portfolio/${project.slug.en}`} className={`${styles.actionButton} ${styles.noDecoration}`}>
                Voir EN
              </Link>
            </>
          )}
        </div>
      </header>

      <main className={styles.mainContent}>
        {project.status === "draft" && !isPublishable && (
          <div className={`${styles.error} ${styles.marginBottom}`}>
            <strong>Checklist avant publication :</strong>
            <ul>
              {(!project.title.fr || !project.title.en) && <li>Titres manquants</li>}
              {(!project.description.fr || !project.description.en) && <li>Descriptions manquantes</li>}
              {(!project.slug.fr || !project.slug.en) && <li>Slugs manquants</li>}
              {project.photos.length === 0 && <li>Aucune photo</li>}
              {!project.coverPhotoId && project.photos.length > 0 && <li>Photo de couverture manquante</li>}
              {project.photos.some((p: Project["photos"][0]) => !p.category) && <li>Catégorie manquante sur des photos</li>}
              {project.photos.some((p: Project["photos"][0]) => !p.alt.fr || !p.alt.en) && <li>Texte alternatif manquant sur des photos</li>}
            </ul>
          </div>
        )}

        <div className={`${styles.loginCard} ${styles.projectFormCard || ''} ${styles.wideCard}`}>
          <Form method="post" className={styles.form}>
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <input type="hidden" name="revision" value={localRevision} />
            <input type="hidden" name="intent" value="update" />
            {!isCustomSlug && (
              <>
                <input type="hidden" name="slugFr" value={derivedSlugFr} />
                <input type="hidden" name="slugEn" value={derivedSlugEn} />
              </>
            )}



            <div className={styles.grid}>
              <div>
                <label htmlFor="titleFr" className={styles.label}>Titre (FR)</label>
                <input id="titleFr" name="titleFr" required disabled={isReadOnly} className={styles.input} value={titleFr} onChange={e => setTitleFr(e.target.value)} />
                {actionData?.fieldErrors?.["title.fr"] && <p className={styles.fieldError}>{actionData.fieldErrors["title.fr"]}</p>}
              </div>
              <div>
                <label htmlFor="titleEn" className={styles.label}>Titre (EN)</label>
                <input id="titleEn" name="titleEn" required disabled={isReadOnly} className={styles.input} value={titleEn} onChange={e => setTitleEn(e.target.value)} />
                {actionData?.fieldErrors?.["title.en"] && <p className={styles.fieldError}>{actionData.fieldErrors["title.en"]}</p>}
              </div>
            </div>

            <div className={styles.slugPreview}>
              <p><strong>Aperçu URL (FR):</strong> /fr/portfolio/{derivedSlugFr || "..."}</p>
              <p><strong>Aperçu URL (EN):</strong> /en/portfolio/{derivedSlugEn || "..."}</p>
              <p className={styles.helpText}>Les majuscules, accents et espaces sont corrigés automatiquement.</p>
              {!isCustomSlug && (
                <button type="button" disabled={isReadOnly} onClick={() => {
                  setSlugFr(derivedSlugFr);
                  setSlugEn(derivedSlugEn);
                  setIsCustomSlug(true);
                }} className={styles.secondaryButton}>
                  Personnaliser l'URL
                </button>
              )}
            </div>

            {isCustomSlug && (
              <div className={styles.grid}>
                <div>
                  <label htmlFor="slugFr" className={styles.label}>Slug personnalisé (FR)</label>
                  <input id="slugFr" name="slugFr" disabled={isReadOnly} className={styles.input} value={slugFr} onChange={e => setSlugFr(e.target.value)} />
                  {actionData?.fieldErrors?.["slug.fr"] && <p className={styles.fieldError}>{actionData.fieldErrors["slug.fr"]}</p>}
                </div>
                <div>
                  <label htmlFor="slugEn" className={styles.label}>Slug personnalisé (EN)</label>
                  <input id="slugEn" name="slugEn" disabled={isReadOnly} className={styles.input} value={slugEn} onChange={e => setSlugEn(e.target.value)} />
                  {actionData?.fieldErrors?.["slug.en"] && <p className={styles.fieldError}>{actionData.fieldErrors["slug.en"]}</p>}
                </div>
              </div>
            )}


            <div className={styles.grid}>
              <div>
                <label htmlFor="descriptionFr" className={styles.label}>Description (FR)</label>
                <textarea id="descriptionFr" name="descriptionFr" required disabled={isReadOnly} defaultValue={project.description.fr} className={styles.input} rows={4} />
                {actionData?.fieldErrors?.["description.fr"] && <p className={styles.fieldError}>{actionData.fieldErrors["description.fr"]}</p>}
              </div>
              <div>
                <label htmlFor="descriptionEn" className={styles.label}>Description (EN)</label>
                <textarea id="descriptionEn" name="descriptionEn" required disabled={isReadOnly} defaultValue={project.description.en} className={styles.input} rows={4} />
                {actionData?.fieldErrors?.["description.en"] && <p className={styles.fieldError}>{actionData.fieldErrors["description.en"]}</p>}
              </div>
            </div>

            <div className={styles.grid}>
              <div>
                <label htmlFor="location" className={styles.label}>Lieu (Optionnel)</label>
                <input id="location" name="location" disabled={isReadOnly} defaultValue={project.location || ""} className={styles.input} />
                {actionData?.fieldErrors?.["location"] && <p className={styles.fieldError}>{actionData.fieldErrors["location"]}</p>}
              </div>
              <div>
                <label htmlFor="date" className={styles.label}>Date (Optionnel YYYY-MM-DD)</label>
                <input id="date" name="date" type="date" disabled={isReadOnly} defaultValue={project.date || ""} className={styles.input} />
                {actionData?.fieldErrors?.["date"] && <p className={styles.fieldError}>{actionData.fieldErrors["date"]}</p>}
              </div>
            </div>

            <div className={styles.marginBottom}>
              <label htmlFor="videoUrl" className={styles.label}>URL Vidéo (Optionnel, YouTube ou Vimeo)</label>
              <input id="videoUrl" name="videoUrl" type="url" disabled={isReadOnly} defaultValue={getCanonicalVideoUrl(project.video)} className={styles.input} placeholder="https://vimeo.com/... ou https://youtube.com/watch?v=..." />
              {actionData?.fieldErrors?.["videoUrl"] && <p className={styles.fieldError}>{actionData.fieldErrors["videoUrl"]}</p>}
            </div>

            {actionData?.error && (
              <p className={styles.error} role="alert">
                {actionData.error}
              </p>
            )}

            <button type="submit" disabled={isSubmitting || isReadOnly} className={styles.submitButton}>
              {isSubmitting ? "Sauvegarde..." : "Enregistrer les modifications"}
            </button>
          </Form>
        </div>

        {/* Photos Section */}
        <div className={`${styles.loginCard} ${styles.wideCard} ${styles.marginTop}`}>
          <h2>Photos ({project.photos.length})</h2>

          {isReadOnly ? (
            <p className={styles.successMessage}>
              Ce projet est public. Repassez-le en brouillon pour modifier ses photos.
            </p>
          ) : (
          <div
            className={styles.uploadZone}
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault();
              handleFiles(event.dataTransfer.files);
            }}
          >
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={e => handleFiles(e.target.files)}
              ref={fileInputRef}
              className={styles.hidden}
            />
            <button
              type="button"
              disabled={uploading || uploadQueue.length > 0}
              onClick={() => fileInputRef.current?.click()}
              className={styles.secondaryButton}
            >
              Sélectionner des photos (max 20)
            </button>
            <p className={styles.helpText}>ou glissez vos images JPEG, PNG ou WebP ici</p>

            {uploadQueue.length > 0 && (
              <div className={styles.marginTopSmall}>
                <p>Upload en cours : reste {uploadQueue.length} fichiers...</p>
                {uploadProgress && (
                  <div className={styles.marginTopSmall}>
                    <progress
                      className={styles.progressBar}
                      max={100}
                      value={uploadProgress.percentage}
                    >
                      {uploadProgress.percentage}%
                    </progress>
                    <p className={styles.progressText}>
                      {uploadProgress.status === "uploading" ? `Envoi... ${uploadProgress.percentage}%` :
                       uploadProgress.status === "processing" ? "Traitement de l'image..." : "Terminé"}
                    </p>
                  </div>
                )}
              </div>
            )}
            {uploadError && (
              <div className={`${styles.error} ${styles.errorMargin}`}>
                <p>{uploadError}</p>
                <div className={styles.errorActions}>
                  <button type="button" onClick={() => setUploadError(null)} className={styles.secondaryButton}>Réessayer</button>
                  <button type="button" onClick={() => { setUploadError(null); setUploadQueue(uploadQueue.slice(1)); }} className={styles.secondaryButton}>Ignorer et continuer</button>
                  <button type="button" onClick={() => { setUploadError(null); setUploadQueue([]); }} className={styles.secondaryButton}>Tout annuler</button>
                </div>
              </div>
            )}
          </div>
          )}

              <div className={styles.photoGrid}>
                {project.photos.map((photo: Project["photos"][0], index: number) => (
                  <DraggablePhoto
                    key={photo.id}
                    photo={photo}
                    projectId={project.id}
                    isCover={project.coverPhotoId === photo.id}
                    disabled={isSubmitting || isReadOnly}
                    isFirst={index === 0}
                    isLast={index === project.photos.length - 1}
                    index={index}
                    onReorder={handleReorder}
                    onMoveUp={() => {
                      if (index === 0) return;
                      const ids = project.photos.map((p: Project["photos"][0]) => p.id);
                      const reordered = [...ids]; const [m] = reordered.splice(index, 1); reordered.splice(index - 1, 0, m);
                      const fd = new FormData();
                      fd.append("intent", "reorderPhotos");
                      fd.append("photoIds", JSON.stringify(reordered));
                      fd.append("csrfToken", csrfToken);
                      fd.append("revision", localRevision);
                      submit(fd, { method: "post" });
                    }}
                    onMoveDown={() => {
                      if (index === project.photos.length - 1) return;
                      const ids = project.photos.map((p: Project["photos"][0]) => p.id);
                      const reordered = [...ids]; const [m] = reordered.splice(index, 1); reordered.splice(index + 1, 0, m);
                      const fd = new FormData();
                      fd.append("intent", "reorderPhotos");
                      fd.append("photoIds", JSON.stringify(reordered));
                      fd.append("csrfToken", csrfToken);
                      fd.append("revision", localRevision);
                      submit(fd, { method: "post" });
                    }}
                    onSaveEdit={(newCat, altFr, altEn) => {
                      const fd = new FormData();
                      fd.append("intent", "updatePhoto");
                      fd.append("photoId", photo.id);
                      fd.append("category", newCat);
                      fd.append("altFr", altFr);
                      fd.append("altEn", altEn);
                      fd.append("csrfToken", csrfToken);
                      fd.append("revision", localRevision);
                      submit(fd, { method: "post" });
                    }}
                    onSetCover={() => {
                      const fd = new FormData();
                      fd.append("intent", "setCover");
                      fd.append("photoId", photo.id);
                      fd.append("csrfToken", csrfToken);
                      fd.append("revision", localRevision);
                      submit(fd, { method: "post" });
                    }}
                    onDelete={() => {
                      if (project.photos.length > 1 && project.coverPhotoId === photo.id) {
                        return alert("Impossible de supprimer la photo de couverture. Choisissez-en une autre d'abord.");
                      }
                      if (confirm("Supprimer cette photo ?")) {
                        const fd = new FormData();
                        fd.append("intent", "trashPhoto");
                        fd.append("photoId", photo.id);
                        fd.append("csrfToken", csrfToken);
                        fd.append("revision", localRevision);
                        submit(fd, { method: "post" });
                      }
                    }}
                  />
                ))}
              </div>

        </div>
      </main>
    </div>
  );
}
