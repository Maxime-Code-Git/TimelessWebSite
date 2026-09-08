import { parseVideoUrl } from "./video";

import fs from "node:fs";
import crypto from "node:crypto";
import { z } from "zod";
import { atomicWriteJson } from "./atomic-fs.server";
import { RevisionConflictError, CorruptedContentError, ValidationError } from "./site-content.server";
import { ENV } from "./env.server";
import path from "node:path";

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

const variantResultSchema = z.object({
  name: z.enum(["480p", "960p", "1440p", "1920p"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sizeBytes: z.number().int().nonnegative(),
  fileId: z.string().regex(variantFileIdRegex, "Invalid variant fileId"),
}).strict();

export const categorySchema = z.object({
  id: z.string().uuid(),
  name: z.object({
    fr: textSchema,
    en: textSchema,
  }).strict(),
  slug: slugSchema,
  order: z.number().int().min(0),
  active: z.boolean(),
}).strict();

export type Category = z.infer<typeof categorySchema>;

export const photoSchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().regex(fileIdRegex, "Invalid fileId format"),
  originalFormat: z.enum(["jpeg", "png", "webp"]),
  originalWidth: z.number().int().positive(),
  originalHeight: z.number().int().positive(),
  categoryId: z.string().uuid().nullable(),
  alt: z.object({
    fr: textSchema.nullable(),
    en: textSchema.nullable(),
  }).strict(),
  variants: z.array(variantResultSchema).min(1, "At least one image variant is required"),
  appliedWatermarkRevision: z.string().regex(revisionHexRegex, "Invalid watermark revision format"),
  processedAt: z.string().refine(val => {
    if (!isoDateRegex.test(val)) return false;
    const d = new Date(val);
    return !isNaN(d.getTime()) && d.toISOString() === val;
  }, "Must be valid ISO with ms"),
  visible: z.boolean(),
  order: z.number().int().min(0),
}).strict()
  .refine(p => new Set(p.variants.map(v => v.name)).size === p.variants.length, "Duplicate variants")
  .refine(p => p.variants.some(v => v.name === "480p"), "A 480p variant is required");

export type Photo = z.infer<typeof photoSchema>;

const youtubeVideoSchema = z.object({
  provider: z.literal("youtube"),
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
}).strict();

const vimeoVideoSchema = z.object({
  provider: z.literal("vimeo"),
  videoId: z.string().regex(/^\d{5,15}$/),
}).strict();

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

const titleSchema = z.string()
  .trim()
  .min(1, "Title is required")
  .max(100, "Title is too long")
  .refine(val => !/[<>]/.test(val), "HTML is not allowed");

const legacyPhotoSchema = z.object({
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
  variants: z.array(variantResultSchema).min(1, "At least one image variant is required"),
  appliedWatermarkRevision: z.string().regex(revisionHexRegex, "Invalid watermark revision format"),
  processedAt: z.string().refine(val => {
    if (!isoDateRegex.test(val)) return false;
    const d = new Date(val);
    return !isNaN(d.getTime()) && d.toISOString() === val;
  }, "Must be valid ISO with ms"),
}).strict()
  .refine(p => new Set(p.variants.map(v => v.name)).size === p.variants.length, "Duplicate variants")
  .refine(p => p.variants.some(v => v.name === "480p"), "A 480p variant is required");

const legacyProjectSchema = z.object({
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
  videoUrl: z.string().trim().url().max(255).nullable().optional(),
  video: z.union([youtubeVideoSchema, vimeoVideoSchema]).nullable().optional(),
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
  photos: z.array(legacyPhotoSchema),
}).strict().superRefine((val, ctx) => {
  if (val.status === "published") {
    if (!val.coverPhotoId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Published projects must have a cover photo", path: ["coverPhotoId"] });
    } else {
      const cover = val.photos.find(p => p.id === val.coverPhotoId);
      if (!cover) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cover photo must belong to the project", path: ["coverPhotoId"] });
      }
    }
  }
  if (val.videoUrl && val.video) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cannot have both videoUrl and video", path: ["video"] });
  }
});

const portfolioSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  revision: z.string().regex(revisionHexRegex, "Invalid revision format"),
  updatedAt: z.string().refine(val => {
    if (!isoDateRegex.test(val)) return false;
    const d = new Date(val);
    return !isNaN(d.getTime()) && d.toISOString() === val;
  }, "Must be valid ISO with ms"),
  projects: z.array(legacyProjectSchema),
  watermark: watermarkConfigSchema.optional(),
}).strict();

export const portfolioSchemaV2 = z.object({
  schemaVersion: z.literal(2),
  revision: z.string().regex(revisionHexRegex, "Invalid revision format"),
  updatedAt: z.string().refine(val => {
    if (!isoDateRegex.test(val)) return false;
    const d = new Date(val);
    return !isNaN(d.getTime()) && d.toISOString() === val;
  }, "Must be valid ISO with ms"),
  categories: z.array(categorySchema),
  photos: z.array(photoSchema),
  video: z.union([youtubeVideoSchema, vimeoVideoSchema]).nullable(),
  watermark: watermarkConfigSchema,
}).strict().superRefine((data, ctx) => {
  const categoryMap = new Map(data.categories.map(c => [c.id, c]));
  for (let i = 0; i < data.photos.length; i++) {
    const photo = data.photos[i];
    if (photo.visible) {
      if (!photo.categoryId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Photo visible doit avoir une catégorie", path: ["photos", i, "categoryId"] });
        continue;
      }
      const category = categoryMap.get(photo.categoryId);
      if (!category) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Catégorie introuvable", path: ["photos", i, "categoryId"] });
      } else if (!category.active) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Photo visible ne peut pas appartenir à une catégorie inactive", path: ["photos", i, "categoryId"] });
      }
      if (!photo.alt.fr || photo.alt.fr.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Alt FR obligatoire", path: ["photos", i, "alt", "fr"] });
      }
      if (!photo.alt.en || photo.alt.en.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Alt EN obligatoire", path: ["photos", i, "alt", "en"] });
      }
    }
  }
});

export type Portfolio = z.infer<typeof portfolioSchemaV2>;

function createDefaultWatermark(globalUpdatedAt: string): WatermarkConfig {
  return {
    mode: "text" as const,
    text: "Sempra",
    revision: "00000000000000000000000000000000",
    updatedAt: globalUpdatedAt,
  };
}

export function createDefaultPortfolioV2(revisionOverride?: string, watermarkOverride?: WatermarkConfig): Portfolio {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    revision: revisionOverride || crypto.randomBytes(16).toString("hex"),
    updatedAt: now,
    categories: [],
    photos: [],
    video: null,
    watermark: watermarkOverride || createDefaultWatermark(now),
  };
}

export function getRawPortfolioContent(): { content: Portfolio; isCorrupted: boolean; isLegacy: boolean } {
  const filePath = getPortfolioContentPath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed.schemaVersion === 1) {
        // Return a fresh in-memory v2 portfolio without modifying data
        const legacyWatermark = parsed.watermark ? watermarkConfigSchema.parse(parsed.watermark) : undefined;
        return { content: createDefaultPortfolioV2(parsed.revision, legacyWatermark), isCorrupted: false, isLegacy: true };
      }

      const validated = portfolioSchemaV2.safeParse(parsed);
      if (validated.success) {
        const stored = validated.data;
        const portfolio: Portfolio = {
          ...stored,
          watermark: stored.watermark ?? createDefaultWatermark(stored.updatedAt),
        };
        return { content: portfolio, isCorrupted: false, isLegacy: false };
      } else {
        return { content: createDefaultPortfolioV2(), isCorrupted: true, isLegacy: false };
      }
    }
  } catch {
    return { content: createDefaultPortfolioV2(), isCorrupted: true, isLegacy: false };
  }
  return { content: createDefaultPortfolioV2(), isCorrupted: false, isLegacy: false };
}

export function getPortfolioContent(): Portfolio {
  const raw = getRawPortfolioContent();
  if (raw.isCorrupted && fs.existsSync(getPortfolioContentPath())) {
    throw new CorruptedContentError();
  }
  return raw.content;
}

export function migrateLegacyPortfolio(previousRevision: string) {
  const filePath = getPortfolioContentPath();
  if (!fs.existsSync(filePath)) {
    throw new Error("Portfolio file not found");
  }

  const contentBuffer = fs.readFileSync(filePath);
  const contentString = contentBuffer.toString("utf-8");

  let parsed;
  try {
    parsed = JSON.parse(contentString);
  } catch {
    throw new Error("Invalid JSON");
  }

  if (parsed.schemaVersion !== 1) {
    if (parsed.schemaVersion === 2 && parsed.revision === previousRevision) {
      return;
    }
    throw new Error("Not a legacy portfolio");
  }

  if (parsed.revision !== previousRevision) {
    throw new RevisionConflictError();
  }

  const v1Data = portfolioSchemaV1.parse(parsed);

  const hash = crypto.createHash("sha256").update(contentBuffer).digest("hex");
  const dirPath = path.dirname(filePath);
  const archivePath = path.resolve(dirPath, `portfolio.legacy.${hash}.json`);

  let fd;
  let archiveCreatedByUs = false;
  try {
    try {
      const stats = fs.lstatSync(archivePath);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new Error("Pre-existing archive is not a regular file");
      }

      if ((stats.mode & 0o777) !== 0o600) {
        throw new Error("Pre-existing archive mode is not 0600");
      }

      const existingContent = fs.readFileSync(archivePath);
      if (!existingContent.equals(contentBuffer)) {
        throw new Error("Pre-existing archive bytes mismatch");
      }
      // If it exists, is a regular file, mode is 0600 and bytes match, we skip creating it
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith("Pre-existing archive")) {
        throw err;
      }
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        fd = fs.openSync(archivePath, "wx", 0o600);
        archiveCreatedByUs = true;
        let bytesWritten = 0;
        while (bytesWritten < contentBuffer.length) {
          const written = fs.writeSync(fd, contentBuffer, bytesWritten, contentBuffer.length - bytesWritten, null);
          if (written <= 0) {
            // eslint-disable-next-line preserve-caught-error
            throw new Error("Failed to write to archive: zero bytes written");
          }
          bytesWritten += written;
        }
        fs.fsyncSync(fd);
      } else {
        throw new Error("Failed to access archive securely", { cause: err });
      }
    }
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* best-effort cleanup on failure */ }
    }
    if (archiveCreatedByUs && fs.existsSync(archivePath)) {
      try { fs.unlinkSync(archivePath); } catch { /* ignore */ }
    }
    throw error;
  }

  if (fd !== undefined) {
    fs.closeSync(fd);
  }

  let dirFd;
  try {
    dirFd = fs.openSync(dirPath, "r");
    fs.fsyncSync(dirFd);
  } finally {
    if (dirFd !== undefined) {
      fs.closeSync(dirFd);
    }
  }

  if (archiveCreatedByUs && fd !== undefined) {
    const writtenContent = fs.readFileSync(archivePath);
    if (!writtenContent.equals(contentBuffer)) {
      try { fs.unlinkSync(archivePath); } catch { /* ignore */ }
      throw new Error("Archive bytes verification failed");
    }
  }

  const legacyWatermark = v1Data.watermark ? watermarkConfigSchema.parse(v1Data.watermark) : undefined;
  const newRevision = crypto.randomBytes(16).toString("hex");
  const newV2 = createDefaultPortfolioV2(newRevision, legacyWatermark);
  atomicWriteJson(filePath, portfolioSchemaV2.parse(newV2));
  return { newRevision: newV2.revision };
}

export function isPortfolioLegacy(): boolean {
  const raw = getRawPortfolioContent();
  return raw.isLegacy;
}

export function assertPortfolioRevision(previousRevision: string): void {
  const current = getRawPortfolioContent();
  if (current.isCorrupted) throw new CorruptedContentError();
  if (
    fs.existsSync(getPortfolioContentPath()) &&
    current.content.revision !== previousRevision
  ) {
    throw new RevisionConflictError();
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

  const parsed = portfolioSchemaV2.parse(newContent);
  atomicWriteJson(getPortfolioContentPath(), parsed);
  return newContent.revision;
}

export function getWatermarkConfig(): WatermarkConfig {
  const portfolio = getPortfolioContent();
  return portfolio.watermark;
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
  if (current.isCorrupted) throw new CorruptedContentError();
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
  let slug = baseSlug || "category";
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

export function createCategory(data: { name: { fr: string, en: string }, slug: string, active: boolean }, previousRevision: string): string {
  if (isPortfolioLegacy()) throw new Error("Cannot mutate legacy portfolio");
  const portfolio = getPortfolioContent();

  const normFr = generateSlug(data.name.fr);
  const normEn = generateSlug(data.name.en);
  const newSlug = generateSlug(data.slug);

  if (portfolio.categories.some(c => generateSlug(c.name.fr) === normFr)) {
    throw new ValidationError("Category name (FR) already exists.");
  }
  if (portfolio.categories.some(c => generateSlug(c.name.en) === normEn)) {
    throw new ValidationError("Category name (EN) already exists.");
  }
  if (portfolio.categories.some(c => c.slug === newSlug)) {
    throw new ValidationError("A category with this slug already exists.");
  }

  const nextOrder = portfolio.categories.length > 0 ? Math.max(...portfolio.categories.map(c => c.order)) + 1 : 0;

  const newCategory: Category = {
    id: crypto.randomUUID(),
    name: {
      fr: textSchema.parse(data.name.fr),
      en: textSchema.parse(data.name.en),
    },
    slug: newSlug,
    order: nextOrder,
    active: data.active,
  };

  portfolio.categories.push(newCategory);
  return savePortfolio(portfolio, previousRevision);
}

export function updateCategory(categoryId: string, data: { name?: { fr: string, en: string }, slug?: string, active?: boolean }, previousRevision: string): string {
  if (isPortfolioLegacy()) throw new Error("Cannot mutate legacy portfolio");
  const portfolio = getPortfolioContent();
  const index = portfolio.categories.findIndex(c => c.id === categoryId);
  if (index === -1) throw new Error("Category not found");

  if (data.name) {
    const normFr = generateSlug(data.name.fr);
    const normEn = generateSlug(data.name.en);
    if (portfolio.categories.some(c => c.id !== categoryId && generateSlug(c.name.fr) === normFr)) {
      throw new ValidationError("Category name (FR) already exists.");
    }
    if (portfolio.categories.some(c => c.id !== categoryId && generateSlug(c.name.en) === normEn)) {
      throw new ValidationError("Category name (EN) already exists.");
    }
    portfolio.categories[index].name = {
      fr: textSchema.parse(data.name.fr),
      en: textSchema.parse(data.name.en),
    };
  }

  if (data.slug !== undefined) {
    const newSlug = generateSlug(data.slug);
    if (portfolio.categories.some(c => c.id !== categoryId && c.slug === newSlug)) {
      throw new ValidationError("A category with this slug already exists.");
    }
    portfolio.categories[index].slug = newSlug;
  }

  if (data.active !== undefined) {
    if (data.active === false) {
      const isUsedByVisiblePhotos = portfolio.photos.some(p => p.categoryId === categoryId && p.visible);
      if (isUsedByVisiblePhotos) {
        throw new ValidationError("Cannot deactivate a category that is currently used by visible photos.");
      }
    }
    portfolio.categories[index].active = data.active;
  }

  return savePortfolio(portfolio, previousRevision);
}

export function deleteCategory(categoryId: string, previousRevision: string): string {
  if (isPortfolioLegacy()) throw new Error("Cannot mutate legacy portfolio");
  const portfolio = getPortfolioContent();
  const isUsed = portfolio.photos.some(p => p.categoryId === categoryId);
  if (isUsed) {
    throw new ValidationError("Cannot delete category in use by photos");
  }
  portfolio.categories = portfolio.categories.filter(c => c.id !== categoryId);
  return savePortfolio(portfolio, previousRevision);
}

export function reorderCategories(categoryIds: string[], previousRevision: string): string {
  if (isPortfolioLegacy()) throw new Error("Cannot mutate legacy portfolio");
  const portfolio = getPortfolioContent();
  if (categoryIds.length !== portfolio.categories.length) throw new ValidationError("Invalid number of category IDs");
  const uniqueIds = new Set(categoryIds);
  if (uniqueIds.size !== categoryIds.length) throw new ValidationError("Duplicate category IDs");

  const newCategories: Category[] = [];
  for (let i = 0; i < categoryIds.length; i++) {
    const id = categoryIds[i];
    const cat = portfolio.categories.find(c => c.id === id);
    if (!cat) throw new ValidationError(`Category ${id} not found`);
    newCategories.push({ ...cat, order: i });
  }
  portfolio.categories = newCategories;
  return savePortfolio(portfolio, previousRevision);
}

// Photos CRUD
export function addPhotoToPortfolio(photo: Omit<Photo, "id" | "categoryId" | "alt" | "visible" | "order">, previousRevision: string, predefinedPhotoId?: string): { newRevision: string, newPhotoId: string } {
  if (isPortfolioLegacy()) throw new Error("Cannot mutate legacy portfolio");
  const portfolio = getPortfolioContent();
  const newPhotoId = predefinedPhotoId || crypto.randomUUID();
  const nextOrder = portfolio.photos.length > 0 ? Math.max(...portfolio.photos.map(p => p.order)) + 1 : 0;

  const newPhoto: Photo = {
    ...photo,
    id: newPhotoId,
    categoryId: null,
    alt: { fr: null, en: null },
    visible: false,
    order: nextOrder,
  };

  portfolio.photos.push(newPhoto);
  const newRevision = savePortfolio(portfolio, previousRevision);
  return { newRevision, newPhotoId };
}

export function updatePhotoMetadata(photoId: string, metadata: { categoryId?: string | null, alt?: { fr: string, en: string } }, previousRevision: string): string {
  if (isPortfolioLegacy()) throw new Error("Cannot mutate legacy portfolio");
  const portfolio = getPortfolioContent();
  const photo = portfolio.photos.find(p => p.id === photoId);
  if (!photo) throw new Error("Photo not found");

  if (metadata.categoryId !== undefined) {
    if (metadata.categoryId !== null) {
      if (!portfolio.categories.some(c => c.id === metadata.categoryId)) {
        throw new ValidationError("Category not found");
      }
    }
    photo.categoryId = metadata.categoryId;
  }

  if (metadata.alt !== undefined) {
    photo.alt = {
      fr: textSchema.parse(metadata.alt.fr),
      en: textSchema.parse(metadata.alt.en),
    };
  }

  // If a photo becomes invalid (e.g. category deleted later, but category deletion is blocked if used), it's fine.
  // But if it lacks category or alt, it should not be visible.
  if (photo.visible) {
    if (!photo.categoryId || !photo.alt.fr || !photo.alt.en) {
      photo.visible = false;
    }
  }

  return savePortfolio(portfolio, previousRevision);
}

export function setPhotoVisibility(photoId: string, visible: boolean, previousRevision: string): string {
  if (isPortfolioLegacy()) throw new Error("Cannot mutate legacy portfolio");
  const portfolio = getPortfolioContent();
  const photo = portfolio.photos.find(p => p.id === photoId);
  if (!photo) throw new Error("Photo not found");

  if (visible) {
    if (!photo.categoryId) throw new ValidationError("Cannot make visible: Category is missing");
    if (!photo.alt.fr || !photo.alt.en) throw new ValidationError("Cannot make visible: Alt texts are missing");
    const cat = portfolio.categories.find(c => c.id === photo.categoryId);
    if (!cat || !cat.active) throw new ValidationError("Cannot make visible: Category is inactive");
  }

  photo.visible = visible;
  return savePortfolio(portfolio, previousRevision);
}

export function reorderPhotos(photoIds: string[], previousRevision: string): string {
  if (isPortfolioLegacy()) throw new Error("Cannot mutate legacy portfolio");
  const portfolio = getPortfolioContent();
  if (photoIds.length !== portfolio.photos.length) throw new ValidationError("Invalid number of photo IDs");
  const uniqueIds = new Set(photoIds);
  if (uniqueIds.size !== photoIds.length) throw new ValidationError("Duplicate photo IDs");

  const newPhotos: Photo[] = [];
  for (let i = 0; i < photoIds.length; i++) {
    const id = photoIds[i];
    const photo = portfolio.photos.find(p => p.id === id);
    if (!photo) throw new ValidationError(`Photo ${id} not found`);
    newPhotos.push({ ...photo, order: i });
  }
  portfolio.photos = newPhotos;
  return savePortfolio(portfolio, previousRevision);
}

export function trashPhoto(photoId: string, previousRevision: string): { newRevision: string, trashedPhoto: Photo } {
  if (isPortfolioLegacy()) throw new Error("Cannot mutate legacy portfolio");
  const portfolio = getPortfolioContent();
  const photoIndex = portfolio.photos.findIndex(p => p.id === photoId);
  if (photoIndex === -1) throw new Error("Photo not found");

  const [trashedPhoto] = portfolio.photos.splice(photoIndex, 1);
  const newRevision = savePortfolio(portfolio, previousRevision);
  return { newRevision, trashedPhoto };
}

// Global Video
export function updateGlobalVideo(videoUrl: string | null, previousRevision: string): string {
  const raw = getRawPortfolioContent();
  if (raw.isLegacy) {
    throw new ValidationError("Cannot update video on legacy portfolio. Please migrate first.");
  }
  const portfolio = raw.content;
  if (videoUrl !== null) {
    const video = parseVideoUrl(videoUrl);
    if (!video) throw new ValidationError("Invalid videoUrl format");
    portfolio.video = video;
  } else {
    portfolio.video = null;
  }
  return savePortfolio(portfolio, previousRevision);
}

export interface PublicPortfolioPhoto {
  id: string;
  categorySlug: string;
  alt: { fr: string, en: string };
  width: number;
  height: number;
  variants: Array<Pick<Photo["variants"][number], "name" | "width" | "height">>;
}

export interface PublicCategory {
  id: string;
  name: { fr: string, en: string };
  slug: string;
}

export type PublicPortfolio = {
  categories: PublicCategory[];
  photos: PublicPortfolioPhoto[];
  video: { provider: "youtube" | "vimeo"; videoId: string } | null;
};

export function getPublicPortfolio(): PublicPortfolio {
  const raw = getRawPortfolioContent();
  if (raw.isCorrupted || raw.isLegacy) {
    return { categories: [], photos: [], video: null };
  }

  const portfolio = getPortfolioContent();
  const activeCategoriesMap = new Map<string, Category>();
  portfolio.categories.filter(c => c.active).forEach(c => activeCategoriesMap.set(c.id, c));

  const publicPhotos: PublicPortfolioPhoto[] = portfolio.photos
    .filter((p): p is Photo & { categoryId: string; alt: { fr: string, en: string } } => {
      return p.visible && p.categoryId !== null && activeCategoriesMap.has(p.categoryId) && typeof p.alt.fr === "string" && typeof p.alt.en === "string";
    })
    .sort((a, b) => a.order - b.order)
    .map(p => {
      const cat = activeCategoriesMap.get(p.categoryId);
      if (!cat) throw new Error("Unreachable");
      return {
        id: p.id,
        categorySlug: cat.slug,
        alt: { fr: p.alt.fr, en: p.alt.en },
        width: p.originalWidth,
        height: p.originalHeight,
        variants: p.variants.map(({ name, width, height }) => ({ name, width, height })),
      };
    });

  const categoriesWithPhotos = new Set(publicPhotos.map(p => p.categorySlug));

  const publicCategories: PublicCategory[] = Array.from(activeCategoriesMap.values())
    .filter(c => categoriesWithPhotos.has(c.slug))
    .sort((a, b) => a.order - b.order)
    .map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
    }));

  return {
    categories: publicCategories,
    photos: publicPhotos,
    video: portfolio.video,
  };
}
