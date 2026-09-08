import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { data, Form, Link, useLoaderData, useSubmit, useFetcher, useNavigation, useFetchers, useRevalidator } from "react-router";
import {
  getRawPortfolioContent,
  migrateLegacyPortfolio,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  updatePhotoMetadata,
  setPhotoVisibility,
  reorderPhotos,
  updateGlobalVideo,
  type Portfolio,
  type Category,
  type Photo
} from "../lib/portfolio-content.server";
import { requireValidAdminSession, validateAdminFormData, ActionSecurityError } from "../lib/admin-auth.server";
import styles from "./admin.module.css";
import * as crypto from "node:crypto";
import { commitSession } from "../lib/session.server";
import { useState, useRef, useEffect } from "react";
import { z } from "zod";
import { RevisionConflictError, CorruptedContentError, ValidationError } from "../lib/site-content.server";

type LoaderData = {
  portfolio: Portfolio;
  isLegacy: boolean;
  csrfToken: string;
  revision: string;
};



export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireValidAdminSession(request);
  const raw = getRawPortfolioContent();

  let csrfToken = session.get("csrfToken");
  const headers = new Headers();
  if (!csrfToken) {
    csrfToken = crypto.randomUUID();
    session.set("csrfToken", csrfToken);
    headers.set("Set-Cookie", await commitSession(session));
  }

  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");

  const loaderPayload: LoaderData = {
    portfolio: raw.content,
    isLegacy: raw.isLegacy,
    csrfToken,
    revision: raw.content.revision
  };

  return data(loaderPayload, { headers });
}

const intentSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("migrateLegacyPortfolio"), revision: z.string().regex(/^[0-9a-f]{32}$/) }).strict(),
  z.object({ intent: z.literal("createCategory"), revision: z.string().regex(/^[0-9a-f]{32}$/), nameFr: z.string().min(1), nameEn: z.string().min(1), slug: z.string().min(1), active: z.enum(["true", "false"]) }).strict(),
  z.object({ intent: z.literal("updateCategory"), revision: z.string().regex(/^[0-9a-f]{32}$/), categoryId: z.string().uuid(), nameFr: z.string().min(1), nameEn: z.string().min(1), slug: z.string().min(1), active: z.enum(["true", "false"]) }).strict(),
  z.object({ intent: z.literal("deleteCategory"), revision: z.string().regex(/^[0-9a-f]{32}$/), categoryId: z.string().uuid() }).strict(),
  z.object({
    intent: z.literal("reorderCategories"),
    revision: z.string().regex(/^[0-9a-f]{32}$/),
    categoryIds: z.string().transform((val, ctx) => {
      try {
        const parsed = JSON.parse(val);
        const arr = z.array(z.string().uuid()).parse(parsed);
        if (new Set(arr).size !== arr.length) throw new Error("Duplicates not allowed");
        return arr;
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid array of UUIDs" });
        return z.NEVER;
      }
    })
  }).strict(),
  z.object({ intent: z.literal("updatePhotoMetadata"), revision: z.string().regex(/^[0-9a-f]{32}$/), photoId: z.string().uuid(), categoryId: z.string().uuid().or(z.literal("")), altFr: z.string(), altEn: z.string() }).strict(),
  z.object({ intent: z.literal("setPhotoVisibility"), revision: z.string().regex(/^[0-9a-f]{32}$/), photoId: z.string().uuid(), visible: z.enum(["true", "false"]) }).strict(),
  z.object({
    intent: z.literal("reorderPhotos"),
    revision: z.string().regex(/^[0-9a-f]{32}$/),
    photoIds: z.string().transform((val, ctx) => {
      try {
        const parsed = JSON.parse(val);
        const arr = z.array(z.string().uuid()).parse(parsed);
        if (new Set(arr).size !== arr.length) throw new Error("Duplicates not allowed");
        return arr;
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid array of UUIDs" });
        return z.NEVER;
      }
    })
  }).strict(),
  z.object({ intent: z.literal("trashPhoto"), revision: z.string().regex(/^[0-9a-f]{32}$/), photoId: z.string().uuid() }).strict(),
  z.object({ intent: z.literal("updateGlobalVideo"), revision: z.string().regex(/^[0-9a-f]{32}$/), videoUrl: z.string().url().or(z.literal("")) }).strict(),
]);

export async function action({ request }: ActionFunctionArgs) {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");

  if (request.method !== "POST") {
    headers.set("Allow", "POST");
    return data({ error: "Method Not Allowed" }, { status: 405, headers });
  }

  let formData: FormData;
  try {
    formData = await validateAdminFormData(request);
  } catch (err: unknown) {
    if (err instanceof ActionSecurityError) {
      if (err.status === 405) {
        headers.set("Allow", "POST");
      }
      return data({ error: err.message }, { status: err.status, headers });
    }
    return data({ error: "Bad Request" }, { status: 400, headers });
  }

  const formObject = Object.fromEntries(formData.entries());
  delete formObject.csrfToken;
  const parsed = intentSchema.safeParse(formObject);

  if (!parsed.success) {
    return data({ error: "Validation failed" }, { status: 422, headers });
  }

  const actionPayload = parsed.data;

  try {
    let newRevision: string;
    switch (actionPayload.intent) {
      case "migrateLegacyPortfolio":
        newRevision = migrateLegacyPortfolio(actionPayload.revision)?.newRevision || actionPayload.revision;
        break;
      case "createCategory":
        newRevision = createCategory({ name: { fr: actionPayload.nameFr, en: actionPayload.nameEn }, slug: actionPayload.slug, active: actionPayload.active === "true" }, actionPayload.revision);
        break;
      case "updateCategory":
        newRevision = updateCategory(actionPayload.categoryId, { name: { fr: actionPayload.nameFr, en: actionPayload.nameEn }, slug: actionPayload.slug, active: actionPayload.active === "true" }, actionPayload.revision);
        break;
      case "deleteCategory":
        newRevision = deleteCategory(actionPayload.categoryId, actionPayload.revision);
        break;
      case "reorderCategories":
        newRevision = reorderCategories(actionPayload.categoryIds, actionPayload.revision);
        break;
      case "updatePhotoMetadata":
        newRevision = updatePhotoMetadata(actionPayload.photoId, { categoryId: actionPayload.categoryId || null, alt: { fr: actionPayload.altFr, en: actionPayload.altEn } }, actionPayload.revision);
        break;
      case "setPhotoVisibility":
        newRevision = setPhotoVisibility(actionPayload.photoId, actionPayload.visible === "true", actionPayload.revision);
        break;
      case "reorderPhotos":
        newRevision = reorderPhotos(actionPayload.photoIds, actionPayload.revision);
        break;
      case "trashPhoto": {
        const { deletePhotoTransactionally } = await import("../lib/portfolio-transaction.server");
        newRevision = deletePhotoTransactionally(actionPayload.photoId, actionPayload.revision).newRevision;
        break;
      }
      case "updateGlobalVideo":
        newRevision = updateGlobalVideo(actionPayload.videoUrl || null, actionPayload.revision);
        break;
    }
    return data({ newRevision }, { headers });
  } catch (err: unknown) {
    if (err instanceof RevisionConflictError || err instanceof CorruptedContentError) {
      return data({ error: "Conflict" }, { status: 409, headers });
    }
    if (err instanceof ValidationError) {
      return data({ error: err.message }, { status: 422, headers });
    }
    return data({ error: "Internal Error" }, { status: 500, headers });
  }
}

function slugify(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

function CategoryItem({ category, csrfToken, getRevision, onRevision, isFirst, isLast, onMoveUp, onMoveDown, isGlobalSubmitting }: { category: Category, csrfToken: string, getRevision: () => string, onRevision: (r: string) => void, isFirst: boolean, isLast: boolean, onMoveUp: () => void, onMoveDown: () => void, isGlobalSubmitting: boolean }) {
  const fetcher = useFetcher<typeof action>();
  const isSubmitting = isGlobalSubmitting || fetcher.state !== "idle";

  const [editing, setEditing] = useState(false);
  const [nameFr, setNameFr] = useState(category.name.fr);
  const [nameEn, setNameEn] = useState(category.name.en);
  const [slug, setSlug] = useState(category.slug || slugify(category.name.fr));

  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "newRevision" in fetcher.data && typeof fetcher.data.newRevision === "string") {
      onRevision(fetcher.data.newRevision);
      setEditing(false);
      setConfirmDelete(false);
    }
  }, [fetcher.state, fetcher.data, onRevision]);

  const handleSave = () => {
    fetcher.submit({ intent: "updateCategory", csrfToken, revision: getRevision(), categoryId: category.id, nameFr, nameEn, slug, active: category.active.toString() }, { method: "post" });
  };

  const handleDelete = () => {
    fetcher.submit({ intent: "deleteCategory", csrfToken, revision: getRevision(), categoryId: category.id }, { method: "post" });
  };

  const handleToggle = () => {
    fetcher.submit({ intent: "updateCategory", csrfToken, revision: getRevision(), categoryId: category.id, nameFr: category.name.fr, nameEn: category.name.en, slug: category.slug || slugify(category.name.fr), active: (!category.active).toString() }, { method: "post" });
  };

  return (
    <div className={styles.categoryItem}>
      <div className={styles.categoryArrows}>
        <button type="button" onClick={onMoveUp} disabled={isFirst || isSubmitting} className={styles.arrowBtn}>▲</button>
        <button type="button" onClick={onMoveDown} disabled={isLast || isSubmitting} className={styles.arrowBtn}>▼</button>
      </div>
      <div className={styles.flex1}>
        {editing ? (
          <div className={styles.flexColGap2}>
            <input value={nameFr} onChange={e => { setNameFr(e.target.value); setSlug(slugify(e.target.value)); }} placeholder="Nom (FR)" className={styles.input} disabled={isSubmitting} />
            <input value={nameEn} onChange={e => setNameEn(e.target.value)} placeholder="Nom (EN)" className={styles.input} disabled={isSubmitting} />
            <input value={slug} onChange={e => setSlug(slugify(e.target.value))} placeholder="Slug" className={styles.input} disabled={isSubmitting} />
            <button type="button" onClick={handleSave} disabled={isSubmitting} className={styles.actionButton}>Sauvegarder</button>
            <button type="button" onClick={() => { setEditing(false); setNameFr(category.name.fr); setNameEn(category.name.en); setSlug(category.slug || slugify(category.name.fr)); }} disabled={isSubmitting} className={styles.actionButtonSecondary}>Annuler</button>
          </div>
        ) : confirmDelete ? (
          <div className={styles.flexRowSpaceBetween}>
            <span className={styles.textRedBold}>Confirmer la suppression de {category.name.fr} ?</span>
            <div className={styles.flexRowGap5}>
              <button type="button" onClick={handleDelete} disabled={isSubmitting} className={styles.logoutButton}>Oui, supprimer</button>
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={isSubmitting} className={styles.actionButtonSecondary}>Annuler</button>
            </div>
          </div>
        ) : (
          <div className={styles.flexRowSpaceBetween}>
            <div>
              <strong>{category.name.fr}</strong> ({category.slug})
              {!category.active && <span className={styles.inactiveText}>(Inactif)</span>}
            </div>
            <div className={styles.flexRowGap5}>
              <button type="button" onClick={() => setEditing(true)} disabled={isSubmitting} className={styles.actionButtonSecondary}>Modifier</button>
              <button type="button" onClick={handleToggle} disabled={isSubmitting} className={styles.actionButtonSecondary}>
                {category.active ? "Désactiver" : "Activer"}
              </button>
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={isSubmitting} className={styles.logoutButton}>Supprimer</button>
            </div>
          </div>
        )}
      </div>
      {fetcher.data && "error" in fetcher.data && (
        <div className={styles.errorMessage}>
          {String(fetcher.data.error)}
        </div>
      )}
    </div>
  );
}

function PhotoItem({ photo, portfolio, csrfToken, getRevision, onRevision, onMoveLeft, onMoveRight, isFirst, isLast, isGlobalSubmitting }: { photo: Photo, portfolio: Portfolio, csrfToken: string, getRevision: () => string, onRevision: (r: string) => void, onMoveLeft: () => void, onMoveRight: () => void, isFirst: boolean, isLast: boolean, isGlobalSubmitting: boolean }) {
  const fetcher = useFetcher<typeof action>();
  const isSubmitting = isGlobalSubmitting || fetcher.state !== "idle";

  const [editing, setEditing] = useState(false);
  const [altFr, setAltFr] = useState(photo.alt.fr || "");
  const [altEn, setAltEn] = useState(photo.alt.en || "");
  const [categoryId, setCategoryId] = useState(photo.categoryId || "");

  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "newRevision" in fetcher.data && typeof fetcher.data.newRevision === "string") {
      onRevision(fetcher.data.newRevision);
      setEditing(false);
      setConfirmDelete(false);
    }
  }, [fetcher.state, fetcher.data, onRevision]);

  const handleSave = () => {
    fetcher.submit({ intent: "updatePhotoMetadata", csrfToken, revision: getRevision(), photoId: photo.id, altFr, altEn, categoryId }, { method: "post" });
  };

  const handleToggleVisible = () => {
    fetcher.submit({ intent: "setPhotoVisibility", csrfToken, revision: getRevision(), photoId: photo.id, visible: (!photo.visible).toString() }, { method: "post" });
  };

  const handleDelete = () => {
    fetcher.submit({ intent: "trashPhoto", csrfToken, revision: getRevision(), photoId: photo.id }, { method: "post" });
  };

  const imgUrl = `/admin/portfolio/media/${photo.id}/admin-thumb`;

  return (
    <div className={styles.photoItem}>
      <div className={styles.photoArrows}>
        <button type="button" onClick={onMoveLeft} disabled={isFirst || isSubmitting} className={styles.arrowBtnBg}>◀</button>
        <button type="button" onClick={onMoveRight} disabled={isLast || isSubmitting} className={styles.arrowBtnBg}>▶</button>
      </div>
      <img src={imgUrl} alt="" className={styles.photoImgCover} />
      <div className={styles.photoContent}>
        {editing ? (
          <>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={styles.input} disabled={isSubmitting}>
              <option value="">Sélectionner Catégorie</option>
              {portfolio.categories.map(c => <option key={c.id} value={c.id}>{c.name.fr}</option>)}
            </select>
            <input value={altFr} onChange={e => setAltFr(e.target.value)} placeholder="Alt (FR)" className={styles.input} disabled={isSubmitting} />
            <input value={altEn} onChange={e => setAltEn(e.target.value)} placeholder="Alt (EN)" className={styles.input} disabled={isSubmitting} />
            <button type="button" onClick={handleSave} disabled={isSubmitting} className={styles.actionButton}>OK</button>
            <button type="button" onClick={() => { setEditing(false); setAltFr(photo.alt.fr || ""); setAltEn(photo.alt.en || ""); setCategoryId(photo.categoryId || ""); }} disabled={isSubmitting} className={styles.actionButtonSecondary}>Annuler</button>
          </>
        ) : confirmDelete ? (
           <div className={styles.flexColGap2}>
             <span className={styles.confirmDeleteText}>Confirmer suppression ?</span>
             <button type="button" onClick={handleDelete} disabled={isSubmitting} className={styles.logoutButton}>Oui</button>
             <button type="button" onClick={() => setConfirmDelete(false)} disabled={isSubmitting} className={styles.actionButtonSecondary}>Non</button>
           </div>
        ) : (
          <>
            <div className={styles.photoCategoryText}>Cat: {portfolio.categories.find(c => c.id === photo.categoryId)?.name.fr || "Aucune"}</div>
            <div className={styles.photoAltText}>Alt FR: {photo.alt.fr}</div>
            <div className={styles.photoActionsRow}>
              <button type="button" onClick={() => setEditing(true)} disabled={isSubmitting} className={`${styles.actionButtonSecondary} ${styles.photoActionButton}`}>Edit</button>
              <button type="button" onClick={handleToggleVisible} disabled={isSubmitting} className={`${styles.actionButtonSecondary} ${styles.photoActionButton}`}>
                {photo.visible ? "Masquer" : "Afficher"}
              </button>
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={isSubmitting} className={`${styles.logoutButton} ${styles.photoActionButton}`}>Del</button>
            </div>
            {!photo.visible && <div className={styles.hiddenText}>Masqué</div>}
          </>
        )}
      </div>
      {fetcher.data && "error" in fetcher.data && fetcher.data.error && (
        <div className={styles.errorMessage}>
          {String(fetcher.data.error)}
        </div>
      )}
    </div>
  );
}

export default function AdminPortfolio() {
  const loaderData = useLoaderData<typeof loader>();
  const { portfolio, isLegacy, csrfToken } = loaderData;

  const fetcher = useFetcher<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const fetchers = useFetchers();
  const revalidator = useRevalidator();
  const [uploads, setUploads] = useState<{id: string, name: string, progress: number, status: string}[]>([]);
  const isUploading = uploads.some(u => u.status === "Uploading...");
  const isGlobalSubmitting = navigation.state !== "idle" || fetchers.some(f => f.state !== "idle") || revalidator.state !== "idle" || fetcher.state !== "idle" || isUploading;

  const [newCatFr, setNewCatFr] = useState("");
  const [newCatEn, setNewCatEn] = useState("");
  const [newCatSlug, setNewCatSlug] = useState("");

  const [videoUrl, setVideoUrl] = useState(
    portfolio?.video ? (portfolio.video.provider === "youtube" ? `https://youtube.com/watch?v=${portfolio.video.videoId}` : `https://vimeo.com/${portfolio.video.videoId}`) : ""
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const revisionRef = useRef(loaderData.revision);

  // Prevent stale loader response from overwriting a newer revision
  useEffect(() => {
    if (navigation.state === "idle" && fetchers.every(f => f.state === "idle")) {
      revisionRef.current = loaderData.revision;
    }
  }, [loaderData.revision, navigation.state, fetchers]);

  const updateRevision = (newRev: string) => {
    if (newRev && /^[0-9a-f]{32}$/.test(newRev)) {
      revisionRef.current = newRev;
    }
  };

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "newRevision" in fetcher.data && typeof fetcher.data.newRevision === "string") {
      updateRevision(fetcher.data.newRevision);
    }
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "newRevision" in fetcher.data && fetcher.data.newRevision) {
      setNewCatFr("");
      setNewCatEn("");
      setNewCatSlug("");
    }
  }, [fetcher.state, fetcher.data]);


  const handleUploadFiles = async (files: FileList | null) => {
    if (isGlobalSubmitting || !files || files.length === 0) return;

    let currentRevision = revisionRef.current;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const uploadId = globalThis.crypto.randomUUID();

      setUploads(prev => [...prev, { id: uploadId, name: file.name, progress: 0, status: "Uploading..." }]);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("/admin/portfolio/upload", {
          method: "POST",
          headers: {
            "x-csrf-token": csrfToken,
            "x-portfolio-revision": currentRevision
          },
          body: formData
        });

        if (response.ok) {
          const data = await response.json();
          if (data && typeof data.newRevision === "string" && /^[0-9a-f]{32}$/.test(data.newRevision)) {
            currentRevision = data.newRevision;
            updateRevision(currentRevision);
            setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: 100, status: "Done" } : u));
          } else {
            setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: "Error: Invalid server response" } : u));
            break;
          }
        } else {
          const errorData = await response.json().catch(() => null);
          const errorMsg = errorData?.error || response.statusText || "Upload failed";
          setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: `Error: ${errorMsg}` } : u));
          break; // Stop the queue
        }
      } catch {
        setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: "Error: Network failure" } : u));
        break; // Stop the queue
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    revalidator.revalidate();
  };

  const moveCategory = (index: number, direction: -1 | 1) => {
    const newOrder = [...portfolio.categories];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(index + direction, 0, moved);
    submit({ intent: "reorderCategories", csrfToken, revision: revisionRef.current, categoryIds: JSON.stringify(newOrder.map(c => c.id)) }, { method: "post" });
  };

  const movePhoto = (index: number, direction: -1 | 1) => {
    const newOrder = [...portfolio.photos];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(index + direction, 0, moved);
    submit({ intent: "reorderPhotos", csrfToken, revision: revisionRef.current, photoIds: JSON.stringify(newOrder.map(p => p.id)) }, { method: "post" });
  };

  if (isLegacy) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.headerTitle}>Portfolio Global V2</h1>
          <Link to="/admin" className={styles.actionButtonSecondary}>Retour</Link>
        </header>
        <main className={styles.mainContent}>
          <div className={styles.dashboardCard}>
            <p>Une ancienne version du portfolio a été détectée.</p>
            <Form method="post">
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="revision" value={revisionRef.current} />
              <button type="submit" name="intent" value="migrateLegacyPortfolio" className={styles.actionButton} disabled={isGlobalSubmitting}>
                Migrer vers V2
              </button>
            </Form>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>Portfolio Global</h1>
          <p className={styles.headerSubtitle}>Gérez la galerie de photos et la vidéo</p>
        </div>
        <div className={styles.projectActions}>
          <Link to="/admin" className={styles.actionButtonSecondary}>Retour</Link>
          <Link to="/admin/portfolio/watermark" className={styles.actionButtonSecondary}>Filigrane</Link>
        </div>
      </header>

      <main className={`${styles.mainContent} ${styles.mainContentPadded}`}>

        {/* VIDEO SECTION */}
        <section className={`${styles.dashboardCard} ${styles.sectionCard}`}>
          <h2 className={styles.sectionTitle}>Vidéo Globale</h2>
          <div className={styles.flexRowGap5}>
            <input
              name="videoUrl"
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              placeholder="URL YouTube ou Vimeo"
              className={`${styles.input} ${styles.videoInput}`}
              disabled={isGlobalSubmitting}
            />
            <button type="button" onClick={() => fetcher.submit({ intent: "updateGlobalVideo", csrfToken, revision: revisionRef.current, videoUrl }, { method: "post" })} disabled={isGlobalSubmitting} className={styles.actionButton}>
              Enregistrer Vidéo
            </button>
            {portfolio.video && (
              <button
                type="button"
                onClick={() => {
                  setVideoUrl("");
                  fetcher.submit({ intent: "updateGlobalVideo", csrfToken, revision: revisionRef.current, videoUrl: "" }, { method: "post" });
                }}
                disabled={isGlobalSubmitting}
                className={styles.logoutButton}
              >
                Supprimer
              </button>
            )}
          </div>
          {fetcher.data && "error" in fetcher.data && (
            <div className={styles.errorMessage}>{String(fetcher.data.error)}</div>
          )}
        </section>

        {/* CATEGORIES SECTION */}
        <section className={`${styles.dashboardCard} ${styles.sectionCard}`}>
          <h2 className={styles.sectionTitle}>Catégories ({portfolio.categories.length})</h2>

          <div>
            {portfolio.categories.map((cat: Category, i: number) => (
              <CategoryItem
                key={cat.id}
                category={cat}
                getRevision={() => revisionRef.current}
                onRevision={updateRevision}
                csrfToken={csrfToken}
                isFirst={i === 0}
                isLast={i === portfolio.categories.length - 1}
                onMoveUp={() => moveCategory(i, -1)}
                onMoveDown={() => moveCategory(i, 1)}
                isGlobalSubmitting={isGlobalSubmitting}
              />
            ))}
          </div>

          <div className={`${styles.flexRowGap5} ${styles.categoryFormRow}`}>
            <input name="nameFr" value={newCatFr} onChange={e => { setNewCatFr(e.target.value); setNewCatSlug(slugify(e.target.value)); }} placeholder="Nom FR" className={`${styles.input} ${styles.flex1}`} disabled={isGlobalSubmitting} />
            <input name="nameEn" value={newCatEn} onChange={e => setNewCatEn(e.target.value)} placeholder="Nom EN" className={`${styles.input} ${styles.flex1}`} disabled={isGlobalSubmitting} />
            <input name="slug" value={newCatSlug} onChange={e => setNewCatSlug(slugify(e.target.value))} placeholder="Slug" className={`${styles.input} ${styles.flex1}`} disabled={isGlobalSubmitting} />
            <button
              type="button"
              onClick={() => {
                if (newCatFr && newCatEn && newCatSlug) {
                  fetcher.submit({ intent: "createCategory", csrfToken, revision: revisionRef.current, active: "true", nameFr: newCatFr, nameEn: newCatEn, slug: newCatSlug }, { method: "post" });
                }
              }}
              disabled={isGlobalSubmitting || !newCatFr || !newCatEn || !newCatSlug}
              className={styles.actionButton}
            >
              Ajouter Catégorie
            </button>
          </div>
          {fetcher.data && "error" in fetcher.data && (
            <div className={styles.errorMessage}>{String(fetcher.data.error)}</div>
          )}
        </section>

        {/* PHOTOS SECTION */}
        <section className={`${styles.dashboardCard} ${styles.sectionCardNoBottom}`}>
          <div className={`${styles.flexRowSpaceBetween} ${styles.marginBottom1}`}>
            <h2 className={styles.sectionTitleNoMargin}>Photos ({portfolio.photos.length})</h2>
            <div>
              <input type="file" multiple accept="image/jpeg, image/png, image/webp" ref={fileInputRef} onChange={e => handleUploadFiles(e.target.files)} className={styles.displayNone} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className={styles.actionButton} disabled={isGlobalSubmitting}>Uploader Photos</button>
            </div>
          </div>

          {uploads.length > 0 && (
            <div className={styles.uploadsContainer}>
              <h4 className={styles.uploadsTitle}>Uploads en cours</h4>
              {uploads.map((u, i) => (
                <div key={i} className={`${styles.flexRowSpaceBetween} ${styles.uploadRow}`}>
                  <span>{u.name}</span>
                  <span className={u.status === "Done" ? styles.uploadStatusDone : (u.status.startsWith("Error") ? styles.uploadStatusError : styles.uploadStatusPending)}>{u.status}</span>
                </div>
              ))}
            </div>
          )}

          <div className={styles.photoGridResponsive}>
            {portfolio.photos.map((photo: Photo, i: number) => (
              <PhotoItem
                key={photo.id}
                photo={photo}
                portfolio={portfolio}
                getRevision={() => revisionRef.current}
                onRevision={updateRevision}
                csrfToken={csrfToken}
                isFirst={i === 0}
                isLast={i === portfolio.photos.length - 1}
                onMoveLeft={() => movePhoto(i, -1)}
                onMoveRight={() => movePhoto(i, 1)}
                isGlobalSubmitting={isGlobalSubmitting}
              />
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
