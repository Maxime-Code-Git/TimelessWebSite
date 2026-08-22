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

export class CorruptedContentError extends Error {
  constructor() {
    super("Corrupted content");
    this.name = "CorruptedContentError";
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
    return path.join(process.cwd(), "data", "site-content.json");
  }
  return path.resolve(process.env.SITE_CONTENT_PATH);
}

function assertExactKeys(obj: unknown, allowedKeys: string[], context: string) {
  if (typeof obj !== "object" || obj === null) {
    throw new ValidationError(`${context} must be an object`);
  }
  const objKeys = Object.keys(obj);
  for (const k of objKeys) {
    if (!allowedKeys.includes(k)) {
      throw new ValidationError(`Unknown property '${k}' in ${context}`);
    }
  }
}

function validateFormula(data: unknown, expectedId: string, context: string): Formula {
  assertExactKeys(data, ["id", "priceCents", "featured"], context);

  const obj = data as Record<string, unknown>;

  if (obj.id !== expectedId) {
    throw new ValidationError(`Invalid id in ${context}, expected ${expectedId}`);
  }

  const priceCents = obj.priceCents;
  if (typeof priceCents !== "number" || !Number.isInteger(priceCents) || priceCents <= 0 || priceCents > 10000000) {
    throw new ValidationError(`Invalid priceCents in ${context}`);
  }

  const featured = obj.featured;
  if (typeof featured !== "boolean") {
    throw new ValidationError(`Invalid featured boolean in ${context}`);
  }

  return { id: expectedId as Formula["id"], priceCents, featured };
}

function validateCategory(data: unknown, categoryName: string): Formula[] {
  if (!Array.isArray(data)) {
    throw new ValidationError(`Category ${categoryName} must be an array`);
  }
  if (data.length !== 3) {
    throw new ValidationError(`Category ${categoryName} must have exactly 3 formulas`);
  }

  const formulas = [
    validateFormula(data.find(f => typeof f === "object" && f !== null && (f as any).id === "essential"), "essential", `${categoryName} > essential`),
    validateFormula(data.find(f => typeof f === "object" && f !== null && (f as any).id === "signature"), "signature", `${categoryName} > signature`),
    validateFormula(data.find(f => typeof f === "object" && f !== null && (f as any).id === "prestige"), "prestige", `${categoryName} > prestige`),
  ];

  const featuredCount = formulas.filter(f => f.featured).length;
  if (featuredCount > 1) {
    throw new ValidationError(`Category ${categoryName} can have at most 1 featured formula`);
  }

  return formulas;
}

function validatePricing(data: unknown): PricingCategory {
  assertExactKeys(data, ["photo", "film", "duo"], "pricing");
  const obj = data as Record<string, unknown>;

  return {
    photo: validateCategory(obj.photo, "photo"),
    film: validateCategory(obj.film, "film"),
    duo: validateCategory(obj.duo, "duo"),
  };
}

function validateStringOrNull(value: unknown, name: string, maxLength = 255): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ValidationError(`${name} must be a string or null`);
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > maxLength) throw new ValidationError(`${name} is too long (max ${maxLength})`);
  if (trimmed.includes("<") || trimmed.includes(">")) throw new ValidationError(`${name} contains forbidden HTML characters`);
  return trimmed;
}

function validateEmail(value: unknown): string | null {
  const email = validateStringOrNull(value, "email", 255);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Invalid email format");
  }
  return email;
}

function validatePhoneE164(value: unknown): string | null {
  const phone = validateStringOrNull(value, "phoneE164", 20);
  if (phone && !/^\+\d{10,15}$/.test(phone)) {
    throw new ValidationError("phoneE164 must start with + and contain only digits");
  }
  return phone;
}

function validateHttpsUrl(value: unknown, name: string): string | null {
  const urlStr = validateStringOrNull(value, name, 255);
  if (!urlStr) return null;

  try {
    const url = new URL(urlStr);
    if (url.protocol !== "https:") {
      throw new ValidationError(`${name} must use https: protocol`);
    }
    if (!url.hostname) {
      throw new ValidationError(`${name} must have a hostname`);
    }
    if (url.username || url.password) {
      throw new ValidationError(`${name} must not contain credentials`);
    }
  } catch (err: any) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError(`${name} is a malformed URL`);
  }
  return urlStr;
}

function validateDepositPercent(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new ValidationError("depositPercent must be an integer between 0 and 100");
  }
  return value;
}

function validateBusiness(data: unknown): BusinessContent {
  assertExactKeys(data, [
    "email", "phoneDisplay", "phoneE164", "address", "enterpriseNumber",
    "legalForm", "legalRepresentative", "hostingProvider", "hostingAddress",
    "depositPercent", "instagramUrl", "linkedinUrl", "serviceArea"
  ], "business");

  const obj = data as Record<string, unknown>;
  assertExactKeys(obj.serviceArea, ["fr", "en"], "serviceArea");
  const sa = obj.serviceArea as Record<string, unknown>;

  const frArea = validateStringOrNull(sa.fr, "serviceArea.fr", 100);
  const enArea = validateStringOrNull(sa.en, "serviceArea.en", 100);

  if (!frArea || !enArea) {
    throw new ValidationError("serviceArea fr and en are required");
  }

  return {
    email: validateEmail(obj.email),
    phoneDisplay: validateStringOrNull(obj.phoneDisplay, "phoneDisplay", 50),
    phoneE164: validatePhoneE164(obj.phoneE164),
    address: validateStringOrNull(obj.address, "address", 255),
    enterpriseNumber: validateStringOrNull(obj.enterpriseNumber, "enterpriseNumber", 50),
    legalForm: validateStringOrNull(obj.legalForm, "legalForm", 100),
    legalRepresentative: validateStringOrNull(obj.legalRepresentative, "legalRepresentative", 100),
    hostingProvider: validateStringOrNull(obj.hostingProvider, "hostingProvider", 100),
    hostingAddress: validateStringOrNull(obj.hostingAddress, "hostingAddress", 255),
    depositPercent: validateDepositPercent(obj.depositPercent),
    instagramUrl: validateHttpsUrl(obj.instagramUrl, "instagramUrl"),
    linkedinUrl: validateHttpsUrl(obj.linkedinUrl, "linkedinUrl"),
    serviceArea: {
      fr: frArea,
      en: enArea,
    }
  };
}

export function validateSiteContent(data: unknown): SiteContent {
  assertExactKeys(data, ["schemaVersion", "revision", "updatedAt", "business", "pricing"], "root");
  const obj = data as Record<string, unknown>;

  if (obj.schemaVersion !== 1) {
    throw new ValidationError("Unsupported schemaVersion");
  }

  if (typeof obj.revision !== "string" || !/^[a-f0-9]{32}$/.test(obj.revision)) {
    throw new ValidationError("Invalid revision format");
  }

  const updatedAtStr = typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString();
  const d = new Date(updatedAtStr);
  if (isNaN(d.getTime()) || d.toISOString() !== updatedAtStr) {
    throw new ValidationError("updatedAt must be a valid ISO Date string");
  }

  return {
    schemaVersion: 1,
    revision: obj.revision,
    updatedAt: updatedAtStr,
    business: validateBusiness(obj.business),
    pricing: validatePricing(obj.pricing),
  };
}

export function getSiteContent(): SiteContent {
  const filePath = getFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      return validateSiteContent(parsed);
    }
  } catch {
    // Ignore
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
  } catch {
    return { content: defaultContent as SiteContent, isCorrupted: true };
  }
  return { content: defaultContent as SiteContent, isCorrupted: false };
}

function manageBackups(filePath: string) {
  if (!fs.existsSync(filePath)) return;

  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath);

  const timestamp = Date.now();
  const backupPath = path.join(dir, `${baseName}.${timestamp}.bak`);
  fs.copyFileSync(filePath, backupPath);
  fs.chmodSync(backupPath, 0o600);

  const files = fs.readdirSync(dir);
  const backups = files
    .filter(f => f.startsWith(baseName) && f.endsWith(".bak"))
    .sort()
    .reverse();

  if (backups.length > 5) {
    for (let i = 5; i < backups.length; i++) {
      try {
        fs.unlinkSync(path.join(dir, backups[i]));
      } catch { /* ignore */ }
    }
  }
}

function atomicSave(newContent: SiteContent, filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempFilePath = `${filePath}.tmp.${crypto.randomBytes(4).toString("hex")}`;
  let fd: number | null = null;
  let dirFd: number | null = null;
  try {
    const jsonStr = JSON.stringify(newContent, null, 2);
    const buffer = Buffer.from(jsonStr, "utf-8");
    fd = fs.openSync(tempFilePath, "w", 0o600);

    let bytesWritten = 0;
    while (bytesWritten < buffer.length) {
      const written = fs.writeSync(fd, buffer, bytesWritten, buffer.length - bytesWritten, bytesWritten);
      if (written <= 0) {
        throw new Error("Wrote 0 bytes");
      }
      bytesWritten += written;
    }

    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    manageBackups(filePath);

    fs.renameSync(tempFilePath, filePath);
    fs.chmodSync(filePath, 0o600);

    dirFd = fs.openSync(dir, "r");
    fs.fsyncSync(dirFd);
  } catch (err) {
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        // ignore
      }
    }
    throw err;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch { /* ignore */ }
    }
    if (dirFd !== null) {
      try {
        fs.closeSync(dirFd);
      } catch { /* ignore */ }
    }
  }
}

export function savePricing(pricing: PricingCategory, previousRevision: string) {
  const current = getRawSiteContent();
  if (current.isCorrupted) {
    throw new CorruptedContentError();
  }
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
  if (current.isCorrupted) {
    throw new CorruptedContentError();
  }
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
