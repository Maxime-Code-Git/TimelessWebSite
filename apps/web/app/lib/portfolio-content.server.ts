import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { atomicWriteJson } from "./atomic-fs.server";
import { RevisionConflictError, CorruptedContentError } from "./site-content.server";

export function getPortfolioContentPath(): string {
  if (process.env.NODE_ENV === "production" && !process.env.PORTFOLIO_CONTENT_PATH) {
    throw new Error("PORTFOLIO_CONTENT_PATH is required in production");
  }
  return process.env.PORTFOLIO_CONTENT_PATH
    ? path.resolve(process.env.PORTFOLIO_CONTENT_PATH)
    : path.join(process.cwd(), "data", "portfolio.json");
}

export function getPortfolioMediaPath(): string {
  if (process.env.NODE_ENV === "production" && !process.env.PORTFOLIO_MEDIA_PATH) {
    throw new Error("PORTFOLIO_MEDIA_PATH is required in production");
  }
  return process.env.PORTFOLIO_MEDIA_PATH
    ? path.resolve(process.env.PORTFOLIO_MEDIA_PATH)
    : path.join(process.cwd(), "data", "media", "portfolio");
}

const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const slugSchema = z.string()
  .min(3, "Slug too short")
  .max(100, "Slug too long")
  .regex(slugRegex, "Invalid slug format");

const textSchema = z.string()
  .min(1, "Text is required")
  .max(2000, "Text is too long")
  .refine(val => !val.includes("<") && !val.includes(">"), "HTML is not allowed");

const titleSchema = z.string()
  .min(1, "Title is required")
  .max(100, "Title is too long")
  .refine(val => !val.includes("<") && !val.includes(">"), "HTML is not allowed");

export const photoSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(["ceremony", "portraits", "reception"]),
  alt: z.object({
    fr: textSchema,
    en: textSchema,
  }).strict(),
  order: z.number().int().min(0),
  originalFormat: z.enum(["jpeg", "png", "webp"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  status: z.literal("processed"),
  variants: z.record(z.string(), z.object({
    id: z.string(),
    sizeBytes: z.number().int().positive(),
  }).strict()),
}).strict();

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
  location: z.string().max(255).nullable().refine(val => !val || (!val.includes("<") && !val.includes(">")), "HTML is not allowed"),
  date: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").nullable(),
  status: z.enum(["draft", "published"]),
  order: z.number().int().min(0),
  coverPhotoId: z.string().uuid().nullable(),
  createdAt: z.string().regex(isoDateRegex, "Must be valid ISO with ms"),
  updatedAt: z.string().regex(isoDateRegex, "Must be valid ISO with ms"),
  photos: z.array(photoSchema),
}).strict();

export const portfolioSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.string().regex(/^[0-9a-f]{32}$/, "Invalid revision format"),
  updatedAt: z.string().regex(isoDateRegex, "Must be valid ISO with ms"),
  projects: z.array(projectSchema),
}).strict();

export type Photo = z.infer<typeof photoSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Portfolio = z.infer<typeof portfolioSchema>;

function createDefaultPortfolio(): Portfolio {
  return {
    schemaVersion: 1,
    revision: crypto.randomBytes(16).toString("hex"),
    updatedAt: new Date().toISOString(),
    projects: [],
  };
}

export function getRawPortfolioContent(): { content: Portfolio; isCorrupted: boolean } {
  const filePath = getPortfolioContentPath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      const validated = portfolioSchema.safeParse(parsed);
      if (validated.success) {
        return { content: validated.data, isCorrupted: false };
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

export function generateSlug(text: string): string {
  return text
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

  const newProject: Project = {
    ...data,
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

export function updateProjectMetadata(projectId: string, data: Omit<Project, "id" | "createdAt" | "updatedAt" | "photos" | "coverPhotoId" | "order">, previousRevision: string): string {
  const portfolio = getPortfolioContent();
  const index = portfolio.projects.findIndex(p => p.id === projectId);
  if (index === -1) throw new Error("Project not found");

  const updatedProject: Project = {
    ...portfolio.projects[index],
    ...data,
    updatedAt: new Date().toISOString(),
  };

  if (updatedProject.status === "published") {
    if (updatedProject.photos.length === 0) {
      throw new Error("Cannot publish a project without photos");
    }
    if (!updatedProject.coverPhotoId) {
      throw new Error("Cannot publish a project without a cover photo");
    }
    const coverExists = updatedProject.photos.find(p => p.id === updatedProject.coverPhotoId);
    if (!coverExists) {
      throw new Error("Cover photo not found in this project");
    }
  }

  checkSlugsUnique(portfolio.projects, updatedProject);

  portfolio.projects[index] = updatedProject;
  return savePortfolio(portfolio, previousRevision);
}

export function reorderProjects(projectIds: string[], previousRevision: string): string {
  const portfolio = getPortfolioContent();
  if (projectIds.length !== portfolio.projects.length) {
    throw new Error("Invalid number of project IDs");
  }

  const newProjects: Project[] = [];
  for (let i = 0; i < projectIds.length; i++) {
    const id = projectIds[i];
    const project = portfolio.projects.find(p => p.id === id);
    if (!project) throw new Error(`Project ${id} not found`);
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
