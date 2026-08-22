import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import defaultContent from "../content/default-site-content.json";

export interface Formula {
  id: "essential" | "signature" | "prestige";
  priceCents: number;
  featured: boolean;
}

export interface PricingCategory {
  photo: Formula[];
  film: Formula[];
  duo: Formula[];
}

export interface BusinessContent {
  email: string | null;
  phoneDisplay: string | null;
  phoneE164: string | null;
  address: string | null;
  enterpriseNumber: string | null;
  legalForm: string | null;
  legalRepresentative: string | null;
  hostingProvider: string | null;
  hostingAddress: string | null;
  depositPercent: number | null;
  instagramUrl: string | null;
  linkedinUrl: string | null;
  serviceArea: {
    fr: string | null;
    en: string | null;
  };
}

export interface SiteContent {
  schemaVersion: number;
  revision: string;
  updatedAt: string;
  business: BusinessContent;
  pricing: PricingCategory;
}

export class RevisionConflictError extends Error {
  constructor() {
    super("Revision conflict");
    this.name = "RevisionConflictError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function getFilePath(): string {
  if (!process.env.SITE_CONTENT_PATH) {
    // Should never happen in a properly configured environment
    return path.join(process.cwd(), "data", "site-content.json");
  }
  return path.resolve(process.env.SITE_CONTENT_PATH);
}

// Strict manual TypeScript validation
function validateFormula(data: any, expectedId: string, context: string): Formula {
  if (typeof data !== "object" || data === null) {
    throw new ValidationError(`Invalid formula object in ${context}`);
  }

  if (data.id !== expectedId) {
    throw new ValidationError(`Invalid id in ${context}, expected ${expectedId}`);
  }

  const priceCents = data.priceCents;
  if (typeof priceCents !== "number" || !Number.isInteger(priceCents) || priceCents <= 0 || priceCents > 10000000) { // 100 000€ max
    throw new ValidationError(`Invalid priceCents in ${context}`);
  }

  const featured = data.featured;
  if (typeof featured !== "boolean") {
    throw new ValidationError(`Invalid featured boolean in ${context}`);
  }

  return { id: expectedId as any, priceCents, featured };
}

function validateCategory(data: any, categoryName: string): Formula[] {
  if (!Array.isArray(data)) {
    throw new ValidationError(`Category ${categoryName} must be an array`);
  }
  if (data.length !== 3) {
    throw new ValidationError(`Category ${categoryName} must have exactly 3 formulas`);
  }

  const formulas = [
    validateFormula(data.find((f: any) => f.id === "essential"), "essential", `${categoryName} > essential`),
    validateFormula(data.find((f: any) => f.id === "signature"), "signature", `${categoryName} > signature`),
    validateFormula(data.find((f: any) => f.id === "prestige"), "prestige", `${categoryName} > prestige`),
  ];

  const featuredCount = formulas.filter(f => f.featured).length;
  if (featuredCount > 1) {
    throw new ValidationError(`Category ${categoryName} can have at most 1 featured formula`);
  }

  return formulas;
}

function validatePricing(data: any): PricingCategory {
  if (typeof data !== "object" || data === null) {
    throw new ValidationError("Pricing must be an object");
  }

  return {
    photo: validateCategory(data.photo, "photo"),
    film: validateCategory(data.film, "film"),
    duo: validateCategory(data.duo, "duo"),
  };
}

function validateStringOrNull(value: any, name: string, maxLength = 255): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ValidationError(`${name} must be a string or null`);
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > maxLength) throw new ValidationError(`${name} is too long (max ${maxLength})`);
  // Refuse HTML tags
  if (/<[a-z][\s\S]*>/i.test(trimmed)) throw new ValidationError(`${name} contains forbidden HTML characters`);
  return trimmed;
}

function validateEmail(value: any): string | null {
  const email = validateStringOrNull(value, "email", 255);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Invalid email format");
  }
  return email;
}

function validatePhoneE164(value: any): string | null {
  const phone = validateStringOrNull(value, "phoneE164", 20);
  if (phone && !/^\+\d{10,15}$/.test(phone)) {
    throw new ValidationError("phoneE164 must start with + and contain only digits");
  }
  return phone;
}

function validateHttpsUrl(value: any, name: string): string | null {
  const url = validateStringOrNull(value, name, 255);
  if (url && !/^https:\/\/[^\s]+$/.test(url)) {
    throw new ValidationError(`${name} must be a valid HTTPS URL`);
  }
  return url;
}

function validateDepositPercent(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new ValidationError("depositPercent must be an integer between 0 and 100");
  }
  return value;
}

function validateBusiness(data: any): BusinessContent {
  if (typeof data !== "object" || data === null) {
    throw new ValidationError("Business must be an object");
  }

  const serviceArea = data.serviceArea;
  if (typeof serviceArea !== "object" || serviceArea === null) {
    throw new ValidationError("serviceArea must be an object");
  }

  const frArea = validateStringOrNull(serviceArea.fr, "serviceArea.fr", 100);
  const enArea = validateStringOrNull(serviceArea.en, "serviceArea.en", 100);

  if (!frArea || !enArea) {
    throw new ValidationError("serviceArea fr and en are required");
  }

  return {
    email: validateEmail(data.email),
    phoneDisplay: validateStringOrNull(data.phoneDisplay, "phoneDisplay", 50),
    phoneE164: validatePhoneE164(data.phoneE164),
    address: validateStringOrNull(data.address, "address", 255),
    enterpriseNumber: validateStringOrNull(data.enterpriseNumber, "enterpriseNumber", 50),
    legalForm: validateStringOrNull(data.legalForm, "legalForm", 100),
    legalRepresentative: validateStringOrNull(data.legalRepresentative, "legalRepresentative", 100),
    hostingProvider: validateStringOrNull(data.hostingProvider, "hostingProvider", 100),
    hostingAddress: validateStringOrNull(data.hostingAddress, "hostingAddress", 255),
    depositPercent: validateDepositPercent(data.depositPercent),
    instagramUrl: validateHttpsUrl(data.instagramUrl, "instagramUrl"),
    linkedinUrl: validateHttpsUrl(data.linkedinUrl, "linkedinUrl"),
    serviceArea: {
      fr: frArea,
      en: enArea,
    }
  };
}

export function validateSiteContent(data: any): SiteContent {
  if (typeof data !== "object" || data === null) {
    throw new ValidationError("SiteContent must be an object");
  }

  if (data.schemaVersion !== 1) {
    throw new ValidationError("Unsupported schemaVersion");
  }

  if (typeof data.revision !== "string") {
    throw new ValidationError("Invalid revision");
  }

  return {
    schemaVersion: 1,
    revision: data.revision,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
    business: validateBusiness(data.business),
    pricing: validatePricing(data.pricing),
  };
}

export function getSiteContent(): SiteContent {
  const filePath = getFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      // We validate on read to avoid serving corrupted content
      return validateSiteContent(parsed);
    }
  } catch (err) {
    // If corrupted or missing, fallback to defaults
    // Admin interface will know it's corrupted if it tries to read raw or save.
    // For the purpose of getSiteContent, just serve defaults if parsing/validation fails.
  }
  return defaultContent as SiteContent;
}

export function getRawSiteContent(): { content: SiteContent, isCorrupted: boolean } {
  const filePath = getFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      return { content: validateSiteContent(parsed), isCorrupted: false };
    }
  } catch (err) {
    return { content: defaultContent as SiteContent, isCorrupted: true };
  }
  return { content: defaultContent as SiteContent, isCorrupted: false };
}

function manageBackups(filePath: string) {
  if (!fs.existsSync(filePath)) return;

  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath);

  // Create a new backup
  const timestamp = Date.now();
  const backupPath = path.join(dir, `${baseName}.${timestamp}.bak`);
  fs.copyFileSync(filePath, backupPath);

  // Limit to 5 backups
  const files = fs.readdirSync(dir);
  const backups = files
    .filter(f => f.startsWith(baseName) && f.endsWith(".bak"))
    .sort()
    .reverse();

  if (backups.length > 5) {
    for (let i = 5; i < backups.length; i++) {
      fs.unlinkSync(path.join(dir, backups[i]));
    }
  }
}

function atomicSave(newContent: SiteContent, filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempFilePath = `${filePath}.tmp.${crypto.randomBytes(4).toString("hex")}`;

  try {
    const jsonStr = JSON.stringify(newContent, null, 2);
    // Write to temp file
    const fd = fs.openSync(tempFilePath, "w", 0o600);
    fs.writeSync(fd, jsonStr);

    // fsync to ensure it's written to disk
    fs.fsyncSync(fd);
    fs.closeSync(fd);

    // Create backup of current file before overwriting
    manageBackups(filePath);

    // Atomic rename
    fs.renameSync(tempFilePath, filePath);
  } catch (err) {
    // Cleanup temp file on error
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        // Ignore unlink errors
      }
    }
    throw err;
  }
}

export function savePricing(pricing: PricingCategory, previousRevision: string) {
  const current = getRawSiteContent();
  if (current.content.revision !== previousRevision) {
    throw new RevisionConflictError();
  }

  const newContent: SiteContent = {
    ...current.content,
    revision: crypto.randomBytes(16).toString("hex"),
    updatedAt: new Date().toISOString(),
    pricing: validatePricing(pricing),
  };

  atomicSave(newContent, getFilePath());
  return newContent.revision;
}

export function saveSettings(business: BusinessContent, previousRevision: string) {
  const current = getRawSiteContent();
  if (current.content.revision !== previousRevision) {
    throw new RevisionConflictError();
  }

  const newContent: SiteContent = {
    ...current.content,
    revision: crypto.randomBytes(16).toString("hex"),
    updatedAt: new Date().toISOString(),
    business: validateBusiness(business),
  };

  atomicSave(newContent, getFilePath());
  return newContent.revision;
}
