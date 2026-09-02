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
  status: z.literal("draft"),
  order: z.number().int().min(0),
  coverPhotoId: z.null(),
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
  photos: z.array(z.never()),
}).strict();

const revisionHexRegex = /^[0-9a-f]{32}$/;

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
});

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
        return { content: createDefaultPortfolio(), isCorrupted: true };
      }
    }
  } catch {
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
  if (text.length === 0 || text.trim().length === 0) {
    throw new ValidationError("Watermark text cannot be empty");
  }
  if (text.length > WATERMARK_TEXT_MAX_LENGTH) {
    throw new ValidationError("Watermark text is too long");
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(text)) {
    throw new ValidationError("Control characters are not allowed");
  }
  if (/<[a-z/!][^>]*>/i.test(text)) {
    throw new ValidationError("HTML tags are not allowed");
  }
  return text;
}

export function updateWatermarkText(text: string, previousPortfolioRevision: string): string {
  const validatedText = validateWatermarkText(text);
  const portfolio = getPortfolioContent();

  if (portfolio.revision !== previousPortfolioRevision && fs.existsSync(getPortfolioContentPath())) {
    throw new RevisionConflictError();
  }

  const current = getRawPortfolioContent();
  if (current.isCorrupted) {
    throw new CorruptedContentError();
  }

  const now = new Date().toISOString();
  const newWatermark: WatermarkConfig = {
    mode: "text" as const,
    text: validatedText,
    revision: crypto.randomBytes(16).toString("hex"),
    updatedAt: now,
  };

  const newContent: Portfolio = {
    ...portfolio,
    watermark: newWatermark,
    revision: crypto.randomBytes(16).toString("hex"),
    updatedAt: now,
  };

  const parsed = portfolioSchema.parse(newContent);
  atomicWriteJson(getPortfolioContentPath(), parsed);
  return newContent.revision;
}

export function generateSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateUniqueSlug(baseSlug: string, existingSlugs: string[]): string {
  let slug = baseSlug || "project";
  if (slug.length < 3) slug = slug.padEnd(3, "0");
  if (slug.length > 100) slug = slug.substring(0, 100).replace(/-+$/, "");

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

  const slugFr = data.slug.fr && data.slug.fr.trim() ? data.slug.fr.trim() : generateUniqueSlug(generateSlug(data.title.fr), existingFrSlugs);
  const slugEn = data.slug.en && data.slug.en.trim() ? data.slug.en.trim() : generateUniqueSlug(generateSlug(data.title.en), existingEnSlugs);

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

  const existingFrSlugs = portfolio.projects.filter(p => p.id !== projectId).map(p => p.slug.fr);
  const existingEnSlugs = portfolio.projects.filter(p => p.id !== projectId).map(p => p.slug.en);

  const slugFr = data.slug.fr && data.slug.fr.trim() ? data.slug.fr.trim() : generateUniqueSlug(generateSlug(data.title.fr), existingFrSlugs);
  const slugEn = data.slug.en && data.slug.en.trim() ? data.slug.en.trim() : generateUniqueSlug(generateSlug(data.title.en), existingEnSlugs);

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
    newProjects.push({ ...project, order: i, updatedAt: new Date().toISOString() });
  }

  portfolio.projects = newProjects;
  return savePortfolio(portfolio, previousRevision);
}

export function deleteEmptyProject(projectId: string, previousRevision: string): string {
  const portfolio = getPortfolioContent();
  const project = portfolio.projects.find(p => p.id === projectId);
  if (!project) throw new Error("Project not found");

  if (project.photos.length > 0) {
    throw new Error("Cannot delete a project that contains photos");
  }

  portfolio.projects = portfolio.projects.filter(p => p.id !== projectId);
  return savePortfolio(portfolio, previousRevision);
}
