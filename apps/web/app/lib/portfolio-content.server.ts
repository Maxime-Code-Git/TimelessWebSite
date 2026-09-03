import fs from "node:fs";
import crypto from "node:crypto";
import { z } from "zod";
import { atomicWriteJson } from "./atomic-fs.server";
import { RevisionConflictError, CorruptedContentError, ValidationError } from "./site-content.server";
import { ENV } from "./env.server";

export function getPortfolioContentPath(): string {
  return ENV.PORTFOLIO_CONTENT_PATH;
}

export function getPortfolioMediaPath(): string {
  return ENV.PORTFOLIO_MEDIA_PATH;
}

const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fileIdRegex = /^[0-9a-f]{32}$/;
const variantFileIdRegex = /^[0-9a-f]{32}-(480p|960p|1440p|1920p)$/;
const revisionHexRegex = /^[0-9a-f]{32}$/;

const slugSchema = z.string()
  .min(3, "Slug too short")
  .max(100, "Slug too long")
  .regex(slugRegex, "Invalid slug format");

const textSchema = z.string()
  .trim()
  .min(1, "Text is required")
  .max(2000, "Text is too long")
  .refine(val => !/[<>]/.test(val), "HTML is not allowed");

const titleSchema = z.string()
  .trim()
  .min(1, "Title is required")
  .max(100, "Title is too long")
  .refine(val => !/[<>]/.test(val), "HTML is not allowed");


const variantResultSchema = z.object({
  name: z.enum(["480p", "960p", "1440p", "1920p"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sizeBytes: z.number().int().nonnegative(),
  fileId: z.string().regex(variantFileIdRegex, "Invalid variant fileId"),
}).strict();

export const photoSchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().regex(fileIdRegex, "Invalid fileId format"),
  originalFormat: z.enum(["jpeg", "png", "webp"]),
  originalWidth: z.number().int().positive(),
  originalHeight: z.number().int().positive(),
  category: z.enum(["ceremony", "portraits", "reception"]),
  alt: z.object({
    fr: textSchema,
    en: textSchema,
  }).strict(),
  variants: z.array(variantResultSchema),
  appliedWatermarkRevision: z.string().regex(revisionHexRegex, "Invalid watermark revision format"),
  processedAt: z.string().refine(val => {
    if (!isoDateRegex.test(val)) return false;
    const d = new Date(val);
    return !isNaN(d.getTime()) && d.toISOString() === val;
  }, "Must be valid ISO with ms"),
}).strict().refine(p => new Set(p.variants.map(v => v.name)).size === p.variants.length, "Duplicate variants");

export type Photo = z.infer<typeof photoSchema>;

export const projectSchema = z.object({
  id: z.string().uuid(),
  slug: z.object({
    fr: slugSchema,
    en: slugSchema,
  }).strict(),
  title: z.object({
    fr: titleSchema,
    en: titleSchema,
  }).strict(),
  description: z.object({
    fr: textSchema,
    en: textSchema,
  }).strict(),
  location: z.string().trim().max(255).nullable().refine(val => !val || !/[<>]/.test(val), "HTML is not allowed"),
  date: z.string().nullable().refine(val => {
    if (!val) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
    const d = new Date(val);
    return !isNaN(d.getTime()) && d.toISOString().startsWith(val);
  }, "Invalid date format or impossible date"),
  status: z.enum(["draft", "published"]),
  order: z.number().int().min(0),
  coverPhotoId: z.string().uuid().nullable(),
  createdAt: z.string().refine(val => {
    if (!isoDateRegex.test(val)) return false;
    const d = new Date(val);
    return !isNaN(d.getTime()) && d.toISOString() === val;
  }, "Must be valid ISO with ms"),
  updatedAt: z.string().refine(val => {
    if (!isoDateRegex.test(val)) return false;
    const d = new Date(val);
    return !isNaN(d.getTime()) && d.toISOString() === val;
  }, "Must be valid ISO with ms"),
  photos: z.array(photoSchema),
}).strict().superRefine((data, ctx) => {
  if (data.coverPhotoId !== null) {
    if (!data.photos.some(p => p.id === data.coverPhotoId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cover photo must belong to project photos", path: ["coverPhotoId"] });
    }
  }
  if (data.status === "published") {
    if (!data.coverPhotoId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Published project must have a cover photo", path: ["coverPhotoId"] });
    }
    if (data.photos.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Published project must have at least one photo", path: ["photos"] });
    }
  }
});

export const watermarkConfigSchema = z.object({
  mode: z.literal("text"),
  text: z.string()
    .min(1, "Watermark text is required")
    .max(40, "Watermark text is too long")
    .refine(val => val.trim().length > 0, "Watermark text cannot be only whitespace")
    // eslint-disable-next-line no-control-regex
    .refine(val => !/[\x00-\x1f\x7f]/.test(val), "Control characters are not allowed")
    .refine(val => !/<[a-z/!][^>]*>/i.test(val), "HTML tags are not allowed"),
  revision: z.string().regex(revisionHexRegex, "Invalid watermark revision format"),
  updatedAt: z.string().refine(val => {
    if (!isoDateRegex.test(val)) return false;
    const d = new Date(val);
    return !isNaN(d.getTime()) && d.toISOString() === val;
  }, "Must be valid ISO with ms"),
}).strict();

export type WatermarkConfig = z.infer<typeof watermarkConfigSchema>;

const portfolioStorageSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.string().regex(revisionHexRegex, "Invalid revision format"),
  updatedAt: z.string().refine(val => {
    if (!isoDateRegex.test(val)) return false;
    const d = new Date(val);
    return !isNaN(d.getTime()) && d.toISOString() === val;
  }, "Must be valid ISO with ms"),
  projects: z.array(projectSchema),
  watermark: watermarkConfigSchema.optional(),
}).strict();

export const portfolioSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.string().regex(revisionHexRegex, "Invalid revision format"),
  updatedAt: z.string().refine(val => {
    if (!isoDateRegex.test(val)) return false;
    const d = new Date(val);
    return !isNaN(d.getTime()) && d.toISOString() === val;
  }, "Must be valid ISO with ms"),
  projects: z.array(projectSchema),
  watermark: watermarkConfigSchema,
}).strict();

export type Portfolio = z.infer<typeof portfolioSchema>;
export type Project = z.infer<typeof projectSchema>;

function createDefaultWatermark(globalUpdatedAt: string): WatermarkConfig {
  return {
    mode: "text" as const,
    text: "Timeless",
    revision: "00000000000000000000000000000000",
    updatedAt: globalUpdatedAt,
  };
}

function createDefaultPortfolio(): Portfolio {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    revision: crypto.randomBytes(16).toString("hex"),
    updatedAt: now,
    projects: [],
    watermark: createDefaultWatermark(now),
  };
}

export function getRawPortfolioContent(): { content: Portfolio; isCorrupted: boolean } {
  const filePath = getPortfolioContentPath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      const validated = portfolioStorageSchema.safeParse(parsed);
      if (validated.success) {
        const stored = validated.data;
        const portfolio: Portfolio = {
          ...stored,
          watermark: stored.watermark ?? createDefaultWatermark(stored.updatedAt),
        };
        return { content: portfolio, isCorrupted: false };
      } else {
        console.error("VALIDATION FAILED", JSON.stringify(validated.error.issues, null, 2));
        return { content: createDefaultPortfolio(), isCorrupted: true };
      }
    }
  } catch (err) {
    console.error("CATCH ERROR", err);
    return { content: createDefaultPortfolio(), isCorrupted: true };
  }
  return { content: createDefaultPortfolio(), isCorrupted: false };
}

export function getPortfolioContent(): Portfolio {
  const raw = getRawPortfolioContent();
  if (raw.isCorrupted && fs.existsSync(getPortfolioContentPath())) {
    throw new CorruptedContentError();
  }
  return raw.content;
}

export function getProjectById(projectId: string): Project | undefined {
  const portfolio = getPortfolioContent();
  return portfolio.projects.find(p => p.id === projectId);
}

export function getWatermarkConfig(): WatermarkConfig {
  const portfolio = getPortfolioContent();
  return portfolio.watermark;
}

function checkSlugsUnique(projects: Project[], newProject: Project) {
  for (const p of projects) {
    if (p.id === newProject.id) continue;
    if (p.slug.fr === newProject.slug.fr) {
      throw new Error(`FR slug '${newProject.slug.fr}' is already used`);
    }
    if (p.slug.en === newProject.slug.en) {
      throw new Error(`EN slug '${newProject.slug.en}' is already used`);
    }
  }
}

function savePortfolio(portfolio: Portfolio, previousRevision: string) {
  const current = getRawPortfolioContent();
  if (current.isCorrupted) {
    throw new CorruptedContentError();
  }
  if (current.content.revision !== previousRevision && fs.existsSync(getPortfolioContentPath())) {
    console.error("REVISION CONFLICT! current:", current.content.revision, "previous:", previousRevision);
    throw new RevisionConflictError();
  }

  const newContent: Portfolio = {
    ...portfolio,
    revision: crypto.randomBytes(16).toString("hex"),
    updatedAt: new Date().toISOString(),
  };

  const parsed = portfolioSchema.parse(newContent);
  atomicWriteJson(getPortfolioContentPath(), parsed);
  return newContent.revision;
}

const WATERMARK_TEXT_MAX_LENGTH = 40;

export function validateWatermarkText(text: string): string {
  if (typeof text !== "string") {
    throw new ValidationError("Watermark text must be a string");
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("Watermark text cannot be empty");
  }
  if (trimmed.length > WATERMARK_TEXT_MAX_LENGTH) {
    throw new ValidationError("Watermark text is too long");
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    throw new ValidationError("Control characters are not allowed");
  }
  if (/<[a-z/!][^>]*>/i.test(trimmed)) {
    throw new ValidationError("HTML tags are not allowed");
  }
  return trimmed;
}

export function updateWatermarkText(text: string, previousPortfolioRevision: string): { portfolioRevision: string, watermarkRevision: string } {
  const validatedText = validateWatermarkText(text);

  const current = getRawPortfolioContent();
  if (current.isCorrupted) {
    throw new CorruptedContentError();
  }

  if (current.content.revision !== previousPortfolioRevision && fs.existsSync(getPortfolioContentPath())) {
    throw new RevisionConflictError();
  }

  const now = new Date().toISOString();
  const watermarkRevision = crypto.randomBytes(16).toString("hex");
  const newWatermark: WatermarkConfig = {
    mode: "text" as const,
    text: validatedText,
    revision: watermarkRevision,
    updatedAt: now,
  };

  const newContent: Portfolio = {
    ...current.content,
    watermark: newWatermark,
  };

  const portfolioRevision = savePortfolio(newContent, previousPortfolioRevision);
  return { portfolioRevision, watermarkRevision };
}

export function generateSlug(text: string): string {
  let slug = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-") // replace non-alphanumeric (except dashes) with single dash
    .replace(/-+/g, "-") // fuse multiple dashes
    .replace(/^-+|-+$/g, ""); // trim dashes

  if (slug.length > 100) {
    slug = slug.substring(0, 100).replace(/-+$/, "");
  }
  return slug;
}

export function generateUniqueSlug(baseSlug: string, existingSlugs: string[]): string {
  let slug = baseSlug || "project";
  if (slug.length < 3) {
    slug = slug.padEnd(3, "0");
  }

  let uniqueSlug = slug;
  let counter = 1;
  while (existingSlugs.includes(uniqueSlug)) {
    const suffix = `-${counter}`;
    if (slug.length + suffix.length > 100) {
      uniqueSlug = `${slug.substring(0, 100 - suffix.length)}${suffix}`;
    } else {
      uniqueSlug = `${slug}${suffix}`;
    }
    counter++;
  }
  return uniqueSlug;
}

export function createProjectDraft(data: Omit<Project, "id" | "createdAt" | "updatedAt" | "photos" | "order" | "status" | "coverPhotoId">, previousRevision: string): string {
  const portfolio = getPortfolioContent();
  const nextOrder = portfolio.projects.length > 0 ? Math.max(...portfolio.projects.map(p => p.order)) + 1 : 0;

  const existingFrSlugs = portfolio.projects.map(p => p.slug.fr);
  const existingEnSlugs = portfolio.projects.map(p => p.slug.en);

  const slugFr = generateUniqueSlug(generateSlug(data.slug.fr && data.slug.fr.trim() ? data.slug.fr : data.title.fr), existingFrSlugs);
  const slugEn = generateUniqueSlug(generateSlug(data.slug.en && data.slug.en.trim() ? data.slug.en : data.title.en), existingEnSlugs);

  const newProject: Project = {
    ...data,
    slug: { fr: slugFr, en: slugEn },
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    photos: [],
    order: nextOrder,
    status: "draft",
    coverPhotoId: null,
  };

  checkSlugsUnique(portfolio.projects, newProject);

  portfolio.projects.push(newProject);
  return savePortfolio(portfolio, previousRevision);
}

export function updateProjectMetadata(projectId: string, data: Omit<Project, "id" | "createdAt" | "updatedAt" | "photos" | "coverPhotoId" | "order" | "status">, previousRevision: string): string {
  const portfolio = getPortfolioContent();
  const index = portfolio.projects.findIndex(p => p.id === projectId);
  if (index === -1) throw new Error("Project not found");
  if (portfolio.projects[index].status === "published") throw new ValidationError("Cannot modify a published project");

  const existingFrSlugs = portfolio.projects.filter(p => p.id !== projectId).map(p => p.slug.fr);
  const existingEnSlugs = portfolio.projects.filter(p => p.id !== projectId).map(p => p.slug.en);

  const slugFr = generateUniqueSlug(generateSlug(data.slug.fr && data.slug.fr.trim() ? data.slug.fr : data.title.fr), existingFrSlugs);
  const slugEn = generateUniqueSlug(generateSlug(data.slug.en && data.slug.en.trim() ? data.slug.en : data.title.en), existingEnSlugs);

  const updatedProject: Project = {
    ...portfolio.projects[index],
    ...data,
    slug: { fr: slugFr, en: slugEn },
    updatedAt: new Date().toISOString(),
  };

  checkSlugsUnique(portfolio.projects, updatedProject);

  portfolio.projects[index] = updatedProject;
  return savePortfolio(portfolio, previousRevision);
}

export function reorderProjects(projectIds: string[], previousRevision: string): string {
  const portfolio = getPortfolioContent();
  if (projectIds.length !== portfolio.projects.length) {
    throw new Error("Invalid number of project IDs");
  }

  const uniqueIds = new Set(projectIds);
  if (uniqueIds.size !== projectIds.length) {
    throw new Error("Duplicate project IDs found");
  }

  const existingIds = new Set(portfolio.projects.map(p => p.id));
  for (const id of projectIds) {
    if (!existingIds.has(id)) {
      throw new Error(`Project ${id} not found in portfolio`);
    }
  }

  const newProjects: Project[] = [];
  for (let i = 0; i < projectIds.length; i++) {
    const id = projectIds[i];
    const project = portfolio.projects.find(p => p.id === id)!;
    if (project.order !== i && project.status === "published") {
      throw new ValidationError("Cannot reorder a published project");
    }
    newProjects.push({ ...project, order: i, updatedAt: new Date().toISOString() });
  }

  portfolio.projects = newProjects;
  return savePortfolio(portfolio, previousRevision);
}

export function deleteEmptyProject(projectId: string, previousRevision: string): string {
  const portfolio = getPortfolioContent();
  const project = portfolio.projects.find(p => p.id === projectId);
  if (!project) throw new Error("Project not found");
  if (project.status === "published") throw new ValidationError("Cannot delete a published project");

  if (project.photos.length > 0) {
    throw new Error("Cannot delete a project that contains photos");
  }

  portfolio.projects = portfolio.projects.filter(p => p.id !== projectId);
  return savePortfolio(portfolio, previousRevision);
}


export function publishProject(projectId: string, previousRevision: string): string {
  const portfolio = getPortfolioContent();
  const project = portfolio.projects.find(p => p.id === projectId);
  if (!project) throw new Error("Project not found");

  if (!project.title.fr || !project.title.en) throw new ValidationError("Missing titles");
  if (!project.description.fr || !project.description.en) throw new ValidationError("Missing descriptions");
  if (!project.slug.fr || !project.slug.en) throw new ValidationError("Missing slugs");
  if (project.photos.length === 0) throw new ValidationError("Project must have at least one photo");
  if (!project.coverPhotoId) throw new ValidationError("Cover photo is missing");

  const coverExists = project.photos.some(p => p.id === project.coverPhotoId);
  if (!coverExists) throw new ValidationError("Cover photo is invalid");

  for (const photo of project.photos) {
    if (!photo.category) throw new ValidationError("Category missing on photo");
    if (!photo.alt.fr || !photo.alt.en) throw new ValidationError("Alt text missing on photo");
  }

  project.status = "published";
  project.updatedAt = new Date().toISOString();
  return savePortfolio(portfolio, previousRevision);
}

export function unpublishProject(projectId: string, previousRevision: string): string {
  const portfolio = getPortfolioContent();
  const project = portfolio.projects.find(p => p.id === projectId);
  if (!project) throw new Error("Project not found");

  project.status = "draft";
  project.updatedAt = new Date().toISOString();
  return savePortfolio(portfolio, previousRevision);
}

export function addPhotoToProject(projectId: string, photo: Omit<Photo, "id">, previousRevision: string): { newRevision: string, newPhotoId: string } {
  const portfolio = getPortfolioContent();
  const project = portfolio.projects.find(p => p.id === projectId);
  if (!project) throw new Error("Project not found");
  if (project.status === "published") throw new ValidationError("Cannot add a photo to a published project");

  const newPhoto: Photo = { ...photo, id: crypto.randomUUID() };
  project.photos.push(newPhoto);

  if (!project.coverPhotoId) {
    project.coverPhotoId = newPhoto.id;
  }

  project.updatedAt = new Date().toISOString();
  const newRevision = savePortfolio(portfolio, previousRevision);
  return { newRevision, newPhotoId: newPhoto.id };
}

export function updatePhotoMetadata(projectId: string, photoId: string, metadata: { category?: "ceremony"|"portraits"|"reception", alt?: {fr: string, en: string} }, previousRevision: string): string {
  const portfolio = getPortfolioContent();
  const project = portfolio.projects.find(p => p.id === projectId);
  if (!project) throw new Error("Project not found");
  if (project.status === "published") throw new ValidationError("Cannot modify photos of a published project");

  const photo = project.photos.find(p => p.id === photoId);
  if (!photo) throw new Error("Photo not found");

  if (metadata.category) photo.category = metadata.category;
  if (metadata.alt) photo.alt = metadata.alt;

  project.updatedAt = new Date().toISOString();
  return savePortfolio(portfolio, previousRevision);
}

export function setProjectCover(projectId: string, photoId: string, previousRevision: string): string {
  const portfolio = getPortfolioContent();
  const project = portfolio.projects.find(p => p.id === projectId);
  if (!project) throw new Error("Project not found");
  if (project.status === "published") throw new ValidationError("Cannot change cover photo of a published project");

  const photo = project.photos.find(p => p.id === photoId);
  if (!photo) throw new Error("Photo not found");

  project.coverPhotoId = photo.id;
  project.updatedAt = new Date().toISOString();
  return savePortfolio(portfolio, previousRevision);
}

export function trashPhoto(projectId: string, photoId: string, previousRevision: string): { newRevision: string, trashedPhoto: Photo } {
  const portfolio = getPortfolioContent();
  const project = portfolio.projects.find(p => p.id === projectId);
  if (!project) throw new Error("Project not found");
  if (project.status === "published") throw new ValidationError("Cannot delete photos from a published project");

  const photoIndex = project.photos.findIndex(p => p.id === photoId);
  if (photoIndex === -1) throw new Error("Photo not found");

  if (project.coverPhotoId === photoId) {
    throw new ValidationError("Cannot delete cover photo. Set another cover first.");
  }

  const [trashedPhoto] = project.photos.splice(photoIndex, 1);
  if (project.coverPhotoId === photoId) {
    project.coverPhotoId = null;
  }

  project.updatedAt = new Date().toISOString();
  const newRevision = savePortfolio(portfolio, previousRevision);

  // Real deletion from disk or moving to .trash will be handled by the caller route.
  return { newRevision, trashedPhoto };
}

export function reorderProjectPhotos(projectId: string, photoIds: string[], previousRevision: string): string {
  const portfolio = getPortfolioContent();
  const project = portfolio.projects.find(p => p.id === projectId);
  if (!project) throw new Error("Project not found");
  if (project.status === "published") throw new ValidationError("Cannot reorder photos of a published project");

  if (photoIds.length !== project.photos.length) throw new Error("Invalid number of photo IDs");
  const uniqueIds = new Set(photoIds);
  if (uniqueIds.size !== photoIds.length) throw new Error("Duplicate photo IDs found");

  const newPhotos: Photo[] = [];
  for (const id of photoIds) {
    const photo = project.photos.find(p => p.id === id);
    if (!photo) throw new Error(`Photo ${id} not found`);
    newPhotos.push(photo);
  }

  project.photos = newPhotos;
  project.updatedAt = new Date().toISOString();
  return savePortfolio(portfolio, previousRevision);
}
