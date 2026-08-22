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
    return path.join(process.cwd(), "data", "site-content.json");
  }
  return path.resolve(process.env.SITE_CONTENT_PATH);
}

function assertExactKeys(obj: any, allowedKeys: string[], context: string) {
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

function validateFormula(data: any, expectedId: string, context: string): Formula {
  assertExactKeys(data, ["id", "priceCents", "featured"], context);

  if (data.id !== expectedId) {
    throw new ValidationError(`Invalid id in ${context}, expected ${expectedId}`);
  }

  const priceCents = data.priceCents;
  if (typeof priceCents !== "number" || !Number.isInteger(priceCents) || priceCents <= 0 || priceCents > 10000000) {
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
    validateFormula(data.find((f: any) => f?.id === "essential"), "essential", `${categoryName} > essential`),
    validateFormula(data.find((f: any) => f?.id === "signature"), "signature", `${categoryName} > signature`),
    validateFormula(data.find((f: any) => f?.id === "prestige"), "prestige", `${categoryName} > prestige`),
  ];

  const featuredCount = formulas.filter(f => f.featured).length;
  if (featuredCount > 1) {
    throw new ValidationError(`Category ${categoryName} can have at most 1 featured formula`);
  }

  return formulas;
}

function validatePricing(data: any): PricingCategory {
  assertExactKeys(data, ["photo", "film", "duo"], "pricing");

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
  if (trimmed.includes("<") || trimmed.includes(">")) throw new ValidationError(`${name} contains forbidden HTML characters`);
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

function validateDepositPercent(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new ValidationError("depositPercent must be an integer between 0 and 100");
  }
  return value;
}

function validateBusiness(data: any): BusinessContent {
  assertExactKeys(data, [
    "email", "phoneDisplay", "phoneE164", "address", "enterpriseNumber",
    "legalForm", "legalRepresentative", "hostingProvider", "hostingAddress",
    "depositPercent", "instagramUrl", "linkedinUrl", "serviceArea"
  ], "business");

  assertExactKeys(data.serviceArea, ["fr", "en"], "serviceArea");

  const frArea = validateStringOrNull(data.serviceArea.fr, "serviceArea.fr", 100);
  const enArea = validateStringOrNull(data.serviceArea.en, "serviceArea.en", 100);

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
  assertExactKeys(data, ["schemaVersion", "revision", "updatedAt", "business", "pricing"], "root");

  if (data.schemaVersion !== 1) {
    throw new ValidationError("Unsupported schemaVersion");
  }

  if (typeof data.revision !== "string" || !/^[a-f0-9]{32}$/.test(data.revision)) {
    throw new ValidationError("Invalid revision format");
  }

  const updatedAtStr = typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString();
  const d = new Date(updatedAtStr);
  if (isNaN(d.getTime()) || d.toISOString() !== updatedAtStr) {
    throw new ValidationError("updatedAt must be a valid ISO Date string");
  }

  return {
    schemaVersion: 1,
    revision: data.revision,
    updatedAt: updatedAtStr,
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
  try {
    const jsonStr = JSON.stringify(newContent, null, 2);
    const buffer = Buffer.from(jsonStr, "utf-8");
    fd = fs.openSync(tempFilePath, "w", 0o600);

    let bytesWritten = 0;
    while (bytesWritten < buffer.length) {
      const written = fs.writeSync(fd, buffer, bytesWritten, buffer.length - bytesWritten, bytesWritten);
      bytesWritten += written;
    }

    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    manageBackups(filePath);

    fs.renameSync(tempFilePath, filePath);
    fs.chmodSync(filePath, 0o600);

    try {
      const dirFd = fs.openSync(dir, "r");
      fs.fsyncSync(dirFd);
      fs.closeSync(dirFd);
    } catch (err: unknown) {
      console.error(err);
    }
  } catch (err) {
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e: unknown) {
        console.error(e);
      }
    }
    throw err;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch { /* ignore */ }
    }
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
