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

export interface LocalizedString {
  fr: string;
  en: string;
}

export interface HomeVariantInfo {
  name: string;
  width: number;
  height: number;
}

export interface HomeImageMetadata {
  imageId: string | null;
  alt: LocalizedString;
  variants: HomeVariantInfo[];
  width?: number;
  height?: number;
}

export interface PortfolioCardContent {
  imageId: string | null;
  variants: HomeVariantInfo[];
  alt: LocalizedString;
  title: LocalizedString;
  subtitle: LocalizedString;
  width?: number;
  height?: number;
}

export interface HomeContent {
  hero: {
    smallTitle: LocalizedString;
    largeTitle: LocalizedString;
    subtitle: LocalizedString;
    images: HomeImageMetadata[];
  };
  editorial: {
    paragraph: LocalizedString;
    highlight: LocalizedString;
  };
  portfolioCards: {
    photo: PortfolioCardContent;
    video: PortfolioCardContent;
  };
  pricingPreview: {
    sectionTitle: LocalizedString;
    photoEssentialDescription: LocalizedString;
    photoSignatureDescription: LocalizedString;
    photoPrestigeDescription: LocalizedString;
    filmEssentialDescription: LocalizedString;
    filmSignatureDescription: LocalizedString;
    filmPrestigeDescription: LocalizedString;
    duoEssentialDescription: LocalizedString;
    duoSignatureDescription: LocalizedString;
    duoPrestigeDescription: LocalizedString;
    promoText: LocalizedString;
    promoTextBold: LocalizedString;
    caveat: LocalizedString;
    buttonText: LocalizedString;
    customFormulaText: LocalizedString;
    customFormulaTextEm: LocalizedString;
  };
  studio: {
    imageId: string | null;
    variants: HomeVariantInfo[];
    alt: LocalizedString;
    title: LocalizedString;
    description: LocalizedString;
    width?: number;
    height?: number;
  };
}

export interface SiteContent {
  schemaVersion: 2;
  revision: string;
  updatedAt: string;
  business: BusinessContent;
  pricing: PricingCategory;
  home: HomeContent;
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
    validateFormula(data.find(f => typeof f === "object" && f !== null && "id" in f && f.id === "essential"), "essential", `${categoryName} > essential`),
    validateFormula(data.find(f => typeof f === "object" && f !== null && "id" in f && f.id === "signature"), "signature", `${categoryName} > signature`),
    validateFormula(data.find(f => typeof f === "object" && f !== null && "id" in f && f.id === "prestige"), "prestige", `${categoryName} > prestige`),
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
  } catch (err: unknown) {
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

function validateLocalizedString(data: unknown, context: string, maxLength = 2000): LocalizedString {
  assertExactKeys(data, ["fr", "en"], context);
  const obj = data as Record<string, unknown>;
  const fr = validateStringOrNull(obj.fr, `${context}.fr`, maxLength);
  const en = validateStringOrNull(obj.en, `${context}.en`, maxLength);
  if (!fr || !en) {
    throw new ValidationError(`fr and en are required in ${context}`);
  }
  return { fr, en };
}

function validateHomeVariantInfo(data: unknown, context: string): HomeVariantInfo {
  if (typeof data !== "object" || data === null) {
    throw new ValidationError(`${context} must be an object`);
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.name !== "string" || !["640p", "960p", "1440p", "1920p"].includes(obj.name)) {
    throw new ValidationError(`${context}.name is invalid`);
  }
  if (typeof obj.width !== "number" || !Number.isInteger(obj.width) || obj.width <= 0) {
    throw new ValidationError(`${context}.width must be a positive integer`);
  }
  if (typeof obj.height !== "number" || !Number.isInteger(obj.height) || obj.height <= 0) {
    throw new ValidationError(`${context}.height must be a positive integer`);
  }
  return { name: obj.name, width: obj.width, height: obj.height };
}

function validateHomeImageMetadata(data: unknown, context: string): HomeImageMetadata {
  if (typeof data !== "object" || data === null) {
    throw new ValidationError(`${context} must be an object`);
  }
  const obj = data as Record<string, unknown>;
  assertExactKeys(obj, ["imageId", "alt", "variants", "width", "height"], context);

  let imageId: string | null = null;
  if (obj.imageId !== null) {
    if (typeof obj.imageId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(obj.imageId)) {
      throw new ValidationError(`${context}.imageId must be a valid UUID or null`);
    }
    imageId = obj.imageId;
  }

  const alt = validateLocalizedString(obj.alt, `${context}.alt`, 255);

  if (imageId === null) {
    if (alt.fr.trim() === "" || alt.en.trim() === "") {
      throw new ValidationError(`${context}.alt must not be empty`);
    }
    if (!Array.isArray(obj.variants) || obj.variants.length > 0) {
      throw new ValidationError(`${context}.variants must be empty when imageId is null`);
    }
    return { imageId, alt, variants: [] };
  }

  if (alt.fr.trim() === "" || alt.en.trim() === "") {
    throw new ValidationError(`${context}.alt must not be empty when imageId is present`);
  }

  if (!Array.isArray(obj.variants) || obj.variants.length === 0) {
    throw new ValidationError(`${context}.variants must contain at least one variant when imageId is present`);
  }

  const variants = obj.variants.map((v, i) => validateHomeVariantInfo(v, `${context}.variants[${i}]`));
  const variantNames = new Set(variants.map(v => v.name));
  if (variantNames.size !== variants.length) {
    throw new ValidationError(`${context}.variants must have unique names`);
  }

  if (typeof obj.width !== "number" || !Number.isInteger(obj.width) || obj.width <= 0) {
    throw new ValidationError(`${context}.width must be a positive integer`);
  }
  const width = obj.width;

  if (typeof obj.height !== "number" || !Number.isInteger(obj.height) || obj.height <= 0) {
    throw new ValidationError(`${context}.height must be a positive integer`);
  }
  const height = obj.height;

  return { imageId, alt, variants, width, height };
}

function validatePortfolioCard(data: unknown, context: string): PortfolioCardContent {
  assertExactKeys(data, ["imageId", "variants", "alt", "title", "subtitle", "width", "height"], context);
  const obj = data as Record<string, unknown>;

  let imageId: string | null = null;
  if (obj.imageId !== null) {
    if (typeof obj.imageId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(obj.imageId)) {
      throw new ValidationError(`${context}.imageId must be a valid UUID or null`);
    }
    imageId = obj.imageId;
  }

  const alt = validateLocalizedString(obj.alt, `${context}.alt`, 255);
  const title = validateLocalizedString(obj.title, `${context}.title`, 255);
  const subtitle = validateLocalizedString(obj.subtitle, `${context}.subtitle`, 255);

  if (imageId === null) {
    if (alt.fr.trim() === "" || alt.en.trim() === "") {
      throw new ValidationError(`${context}.alt must not be empty`);
    }
    if (!Array.isArray(obj.variants) || obj.variants.length > 0) {
      throw new ValidationError(`${context}.variants must be empty when imageId is null`);
    }
    return { imageId, variants: [], alt, title, subtitle };
  }

  if (alt.fr.trim() === "" || alt.en.trim() === "") {
    throw new ValidationError(`${context}.alt must not be empty when imageId is present`);
  }

  if (!Array.isArray(obj.variants) || obj.variants.length === 0) {
    throw new ValidationError(`${context}.variants must contain at least one variant when imageId is present`);
  }
  const variants = obj.variants.map((v, i) => validateHomeVariantInfo(v, `${context}.variants[${i}]`));
  const variantNames = new Set(variants.map(v => v.name));
  if (variantNames.size !== variants.length) {
    throw new ValidationError(`${context}.variants must have unique names`);
  }

  if (typeof obj.width !== "number" || !Number.isInteger(obj.width) || obj.width <= 0) {
    throw new ValidationError(`${context}.width must be a positive integer`);
  }
  const width = obj.width;

  if (typeof obj.height !== "number" || !Number.isInteger(obj.height) || obj.height <= 0) {
    throw new ValidationError(`${context}.height must be a positive integer`);
  }
  const height = obj.height;

  return { imageId, variants, alt, title, subtitle, width, height };
}

function validateHomeContent(data: unknown): HomeContent {
  assertExactKeys(data, ["hero", "editorial", "portfolioCards", "pricingPreview", "studio"], "home");
  const obj = data as Record<string, unknown>;

  // Validate hero
  assertExactKeys(obj.hero, ["smallTitle", "largeTitle", "subtitle", "images"], "home.hero");
  const heroObj = obj.hero as Record<string, unknown>;
  if (!Array.isArray(heroObj.images) || heroObj.images.length !== 3) {
    throw new ValidationError("home.hero.images must be an array of exactly 3 slots");
  }

  // Validate editorial
  assertExactKeys(obj.editorial, ["paragraph", "highlight"], "home.editorial");
  const editorialObj = obj.editorial as Record<string, unknown>;

  // Validate portfolioCards
  assertExactKeys(obj.portfolioCards, ["photo", "video"], "home.portfolioCards");
  const cardsObj = obj.portfolioCards as Record<string, unknown>;

  // Validate pricingPreview
  assertExactKeys(obj.pricingPreview, [
    "sectionTitle",
    "photoEssentialDescription", "photoSignatureDescription", "photoPrestigeDescription",
    "filmEssentialDescription", "filmSignatureDescription", "filmPrestigeDescription",
    "duoEssentialDescription", "duoSignatureDescription", "duoPrestigeDescription",
    "promoText", "promoTextBold", "caveat", "buttonText", "customFormulaText", "customFormulaTextEm"
  ], "home.pricingPreview");
  const pricingObj = obj.pricingPreview as Record<string, unknown>;

  // Validate studio
  assertExactKeys(obj.studio, ["imageId", "variants", "alt", "title", "description", "width", "height"], "home.studio");
  const studioObj = obj.studio as Record<string, unknown>;

  let studioImageId: string | null = null;
  if (studioObj.imageId !== null) {
    if (typeof studioObj.imageId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studioObj.imageId)) {
      throw new ValidationError(`home.studio.imageId must be a valid UUID or null`);
    }
    studioImageId = studioObj.imageId;
  }

  const studioAlt = validateLocalizedString(studioObj.alt, `home.studio.alt`, 255);

  let studioVariants: HomeVariantInfo[] = [];
  let studioWidth: number | undefined;
  let studioHeight: number | undefined;

  if (studioImageId === null) {
    if (studioAlt.fr.trim() === "" || studioAlt.en.trim() === "") {
      throw new ValidationError(`home.studio.alt must not be empty`);
    }
    if (!Array.isArray(studioObj.variants) || studioObj.variants.length > 0) {
      throw new ValidationError(`home.studio.variants must be empty when imageId is null`);
    }
  } else {
    if (studioAlt.fr.trim() === "" || studioAlt.en.trim() === "") {
      throw new ValidationError(`home.studio.alt must not be empty when imageId is present`);
    }
    if (!Array.isArray(studioObj.variants) || studioObj.variants.length === 0) {
      throw new ValidationError(`home.studio.variants must contain at least one variant when imageId is present`);
    }
    studioVariants = studioObj.variants.map((v, i) => validateHomeVariantInfo(v, `home.studio.variants[${i}]`));
    const variantNames = new Set(studioVariants.map(v => v.name));
    if (variantNames.size !== studioVariants.length) {
      throw new ValidationError(`home.studio.variants must have unique names`);
    }

    if (typeof studioObj.width !== "number" || !Number.isInteger(studioObj.width) || studioObj.width <= 0) {
      throw new ValidationError(`home.studio.width must be a positive integer`);
    }
    studioWidth = studioObj.width;

    if (typeof studioObj.height !== "number" || !Number.isInteger(studioObj.height) || studioObj.height <= 0) {
      throw new ValidationError(`home.studio.height must be a positive integer`);
    }
    studioHeight = studioObj.height;
  }

  return {
    hero: {
      smallTitle: validateLocalizedString(heroObj.smallTitle, "home.hero.smallTitle", 255),
      largeTitle: validateLocalizedString(heroObj.largeTitle, "home.hero.largeTitle", 255),
      subtitle: validateLocalizedString(heroObj.subtitle, "home.hero.subtitle", 255),
      images: [
        validateHomeImageMetadata(heroObj.images[0], "home.hero.images[0]"),
        validateHomeImageMetadata(heroObj.images[1], "home.hero.images[1]"),
        validateHomeImageMetadata(heroObj.images[2], "home.hero.images[2]"),
      ]
    },
    editorial: {
      paragraph: validateLocalizedString(editorialObj.paragraph, "home.editorial.paragraph"),
      highlight: validateLocalizedString(editorialObj.highlight, "home.editorial.highlight")
    },
    portfolioCards: {
      photo: validatePortfolioCard(cardsObj.photo, "home.portfolioCards.photo"),
      video: validatePortfolioCard(cardsObj.video, "home.portfolioCards.video")
    },
    pricingPreview: {
      sectionTitle: validateLocalizedString(pricingObj.sectionTitle, "home.pricingPreview.sectionTitle", 255),
      photoEssentialDescription: validateLocalizedString(pricingObj.photoEssentialDescription, "home.pricingPreview.photoEssentialDescription", 1000),
      photoSignatureDescription: validateLocalizedString(pricingObj.photoSignatureDescription, "home.pricingPreview.photoSignatureDescription", 1000),
      photoPrestigeDescription: validateLocalizedString(pricingObj.photoPrestigeDescription, "home.pricingPreview.photoPrestigeDescription", 1000),
      filmEssentialDescription: validateLocalizedString(pricingObj.filmEssentialDescription, "home.pricingPreview.filmEssentialDescription", 1000),
      filmSignatureDescription: validateLocalizedString(pricingObj.filmSignatureDescription, "home.pricingPreview.filmSignatureDescription", 1000),
      filmPrestigeDescription: validateLocalizedString(pricingObj.filmPrestigeDescription, "home.pricingPreview.filmPrestigeDescription", 1000),
      duoEssentialDescription: validateLocalizedString(pricingObj.duoEssentialDescription, "home.pricingPreview.duoEssentialDescription", 1000),
      duoSignatureDescription: validateLocalizedString(pricingObj.duoSignatureDescription, "home.pricingPreview.duoSignatureDescription", 1000),
      duoPrestigeDescription: validateLocalizedString(pricingObj.duoPrestigeDescription, "home.pricingPreview.duoPrestigeDescription", 1000),
      promoText: validateLocalizedString(pricingObj.promoText, "home.pricingPreview.promoText", 255),
      promoTextBold: validateLocalizedString(pricingObj.promoTextBold, "home.pricingPreview.promoTextBold", 255),
      caveat: validateLocalizedString(pricingObj.caveat, "home.pricingPreview.caveat", 255),
      buttonText: validateLocalizedString(pricingObj.buttonText, "home.pricingPreview.buttonText", 255),
      customFormulaText: validateLocalizedString(pricingObj.customFormulaText, "home.pricingPreview.customFormulaText", 255),
      customFormulaTextEm: validateLocalizedString(pricingObj.customFormulaTextEm, "home.pricingPreview.customFormulaTextEm", 255)
    },
    studio: {
      imageId: studioImageId,
      variants: studioVariants,
      alt: studioAlt,
      title: validateLocalizedString(studioObj.title, "home.studio.title", 255),
      description: validateLocalizedString(studioObj.description, "home.studio.description", 2000),
      width: studioWidth,
      height: studioHeight
    }
  };
}

export function validateSiteContent(data: unknown): SiteContent {
  if (typeof data !== "object" || data === null) {
    throw new ValidationError("root must be an object");
  }
  const obj = data as Record<string, unknown>;

  if (obj.schemaVersion !== 1 && obj.schemaVersion !== 2) {
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

  const business = validateBusiness(obj.business);
  const pricing = validatePricing(obj.pricing);

  if (obj.schemaVersion === 1) {
    // Migration en mémoire
    return {
      schemaVersion: 2,
      revision: obj.revision,
      updatedAt: updatedAtStr,
      business,
      pricing,
      home: validateHomeContent(defaultContent.home),
    };
  }

  // INTERMEDIATE V2 MIGRATION
  let objRef = obj;
  const homeData = obj.home as Record<string, unknown>;

  if (homeData && typeof homeData === "object") {
    let needsMigration = false;
    let migratedHomeData = { ...homeData };

    // Add missing fallback alts for older version
    if (migratedHomeData.hero && Array.isArray((migratedHomeData.hero as Record<string, unknown>).images)) {
      migratedHomeData.hero = {
        ...migratedHomeData.hero as Record<string, unknown>,
        images: ((migratedHomeData.hero as Record<string, unknown>).images as Record<string, unknown>[]).map((img) => {
          const updated = { ...img };
          if (!updated.alt) updated.alt = { fr: "Image", en: "Image" };
          if (updated.imageId === null && !updated.variants) updated.variants = [];
          return updated;
        })
      };
      needsMigration = true;
    }

    if (migratedHomeData.portfolioCards) {
      const cards = migratedHomeData.portfolioCards as Record<string, unknown>;
      if (cards.photo) {
        cards.photo = { ...(cards.photo as Record<string, unknown>) };
        if (!(cards.photo as Record<string, unknown>).alt) (cards.photo as Record<string, unknown>).alt = { fr: "Image", en: "Image" };
        if ((cards.photo as Record<string, unknown>).imageId === null && !(cards.photo as Record<string, unknown>).variants) (cards.photo as Record<string, unknown>).variants = [];
      }
      if (cards.video) {
        cards.video = { ...(cards.video as Record<string, unknown>) };
        if (!(cards.video as Record<string, unknown>).alt) (cards.video as Record<string, unknown>).alt = { fr: "Image", en: "Image" };
        if ((cards.video as Record<string, unknown>).imageId === null && !(cards.video as Record<string, unknown>).variants) (cards.video as Record<string, unknown>).variants = [];
      }
      migratedHomeData.portfolioCards = { ...cards };
      needsMigration = true;
    }

    if (migratedHomeData.studio) {
      const studio = migratedHomeData.studio as Record<string, unknown>;
      migratedHomeData.studio = { ...studio };
      if (!(migratedHomeData.studio as Record<string, unknown>).alt) {
        (migratedHomeData.studio as Record<string, unknown>).alt = { fr: "Image", en: "Image" };
        needsMigration = true;
      }
      if ((migratedHomeData.studio as Record<string, unknown>).imageId === null && !(migratedHomeData.studio as Record<string, unknown>).variants) {
        (migratedHomeData.studio as Record<string, unknown>).variants = [];
        needsMigration = true;
      }
    }

    if (migratedHomeData.pricingPreview) {
      const preview = migratedHomeData.pricingPreview as Record<string, unknown>;
      if ("essentialDescription" in preview && !("photoEssentialDescription" in preview)) {
        const migratedPreview = { ...preview };

        migratedPreview.photoEssentialDescription = migratedPreview.essentialDescription;
        migratedPreview.photoSignatureDescription = migratedPreview.signatureDescription;
        migratedPreview.photoPrestigeDescription = migratedPreview.prestigeDescription;

        delete migratedPreview.essentialDescription;
        delete migratedPreview.signatureDescription;
        delete migratedPreview.prestigeDescription;

        migratedPreview.filmEssentialDescription = migratedPreview.filmEssentialDescription || defaultContent.home.pricingPreview.filmEssentialDescription;
        migratedPreview.filmSignatureDescription = migratedPreview.filmSignatureDescription || defaultContent.home.pricingPreview.filmSignatureDescription;
        migratedPreview.filmPrestigeDescription = migratedPreview.filmPrestigeDescription || defaultContent.home.pricingPreview.filmPrestigeDescription;

        migratedPreview.duoEssentialDescription = migratedPreview.duoEssentialDescription || defaultContent.home.pricingPreview.duoEssentialDescription;
        migratedPreview.duoSignatureDescription = migratedPreview.duoSignatureDescription || defaultContent.home.pricingPreview.duoSignatureDescription;
        migratedPreview.duoPrestigeDescription = migratedPreview.duoPrestigeDescription || defaultContent.home.pricingPreview.duoPrestigeDescription;

        migratedHomeData = { ...migratedHomeData, pricingPreview: migratedPreview };
        needsMigration = true;
      }
    }

    if (needsMigration) {
      objRef = { ...obj, home: migratedHomeData };
    }
  }

  assertExactKeys(objRef, ["schemaVersion", "revision", "updatedAt", "business", "pricing", "home"], "root");
  const home = validateHomeContent(objRef.home);

  return {
    schemaVersion: 2,
    revision: obj.revision,
    updatedAt: updatedAtStr,
    business,
    pricing,
    home,
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
  return validateSiteContent(defaultContent);
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
    return { content: validateSiteContent(defaultContent), isCorrupted: true };
  }
  return { content: validateSiteContent(defaultContent), isCorrupted: false };
}

import { atomicWriteJson } from "./atomic-fs.server";

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

  atomicWriteJson(getFilePath(), newContent);
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

  atomicWriteJson(getFilePath(), newContent);
  return newContent.revision;
}

export function saveHomeSettings(home: HomeContent, previousRevision: string) {
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
    home: validateHomeContent(home),
  };

  atomicWriteJson(getFilePath(), newContent);
  return newContent.revision;
}
