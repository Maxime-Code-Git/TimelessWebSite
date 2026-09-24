import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import defaultContent from "../content/default-site-content.json";

export interface FormulaIncludedItem {
  id: string;
  text: LocalizedString;
}

export interface Formula {
  id: "essential" | "signature" | "prestige";
  priceCents: number;
  featured: boolean;
  enabled: boolean;
  name: LocalizedString;
  summary: LocalizedString;
  description: LocalizedString;
  includedItems: FormulaIncludedItem[];
  buttonText: LocalizedString;
}

export interface PricingCategory {
  photo: Formula[];
  film: Formula[];
  duo: Formula[];
}

export interface BusinessContent {
  legalName: string | null;
  tradeName: string | null;
  vatNumber: string | null;
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


export interface PricingFaqItem {
  id: string;
  enabled: boolean;
  question: LocalizedString;
  answer: LocalizedString;
}

export interface PricingPageContent {
  faqTitle: LocalizedString;
  faqs: PricingFaqItem[];
  promoText: LocalizedString;
  promoTextBold: LocalizedString;
  caveat: LocalizedString;
}

export interface AboutPageContent {
  seo: {
    title: LocalizedString;
    description: LocalizedString;
  };
  hero: {
    title: LocalizedString;
    subtitle: LocalizedString;
  };
  team: {
    members: Array<{
      id: "photographer" | "videographer";
      name: LocalizedString;
      role: LocalizedString;
      bio: LocalizedString;
      image: HomeImageMetadata;
    }>;
  };
  approach: {
    title: LocalizedString;
    principles: Array<{
      id: string;
      title: LocalizedString;
      text: LocalizedString;
    }>;
  };
  difference: {
    title: LocalizedString;
    text: LocalizedString;
  };
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


export interface ContactPageContent {
  seo: {
    title: LocalizedString;
    description: LocalizedString;
  };
  hero: {
    title: LocalizedString;
    subtitle: LocalizedString;
  };
  introBanner: {
    title: LocalizedString;
    subtitle: LocalizedString;
    badges: Array<{
      id: string;
      label: LocalizedString;
    }>;
  };
  bookingIntro: {
    overtitle: LocalizedString;
    title: LocalizedString;
    description: LocalizedString;
    note: LocalizedString;
  };
  visioBooking: {
    title: LocalizedString;
    unavailableMsg: LocalizedString;
    selectDate: LocalizedString;
    selectTime: LocalizedString;
    timezone: LocalizedString;
    formTitle: LocalizedString;
    labelNames: LocalizedString;
    labelEmail: LocalizedString;
    labelPhone: LocalizedString;
    labelWeddingDate: LocalizedString;
    labelFormula: LocalizedString;
    labelMessage: LocalizedString;
    formulas: {
      photo: LocalizedString;
      film: LocalizedString;
      duo: LocalizedString;
      custom: LocalizedString;
      unknown: LocalizedString;
    };
    btnSubmit: LocalizedString;
    btnSubmitting: LocalizedString;
    successTitle: LocalizedString;
    successMsg: LocalizedString;
    btnNewRequest: LocalizedString;
    errTaken: LocalizedString;
    errGeneric: LocalizedString;
    loadingMsg: LocalizedString;
  };
  contactForm: {
    formPrompt: LocalizedString;
    successMsg: LocalizedString;
    btnSubmitting: LocalizedString;
    labels: {
      names: LocalizedString;
      email: LocalizedString;
      phone: LocalizedString;
      date: LocalizedString;
      location: LocalizedString;
      formula: LocalizedString;
      message: LocalizedString;
      submit: LocalizedString;
    };
    placeholders: {
      names: LocalizedString;
      email: LocalizedString;
      phone: LocalizedString;
      location: LocalizedString;
      formulaDefault: LocalizedString;
      message: LocalizedString;
    };
    groupLabels: {
      photo: LocalizedString;
      film: LocalizedString;
      duo: LocalizedString;
    };
    options: {
      custom: LocalizedString;
      unknown: LocalizedString;
    };
    errors: {
      invalidType: LocalizedString;
      invalidRequest: LocalizedString;
      payloadTooLarge: LocalizedString;
      readError: LocalizedString;
      invalidOrigin: LocalizedString;
      requiredFields: LocalizedString;
      maxLength: LocalizedString;
      invalidEmail: LocalizedString;
      invalidChars: LocalizedString;
      invalidFormula: LocalizedString;
      invalidDateFormat: LocalizedString;
      invalidDate: LocalizedString;
      invalidPhone: LocalizedString;
      invalidNetwork: LocalizedString;
      rateLimit: LocalizedString;
      sendError: LocalizedString;
    };
  };
  contactDetails: {
    title: LocalizedString;
    labelEmail: LocalizedString;
    labelPhone: LocalizedString;
    labelArea: LocalizedString;
    labelSocial: LocalizedString;
    labelInstagram: LocalizedString;
    labelLinkedin: LocalizedString;
    responseTime: LocalizedString;
  };
  bottomBanner: {
    text: LocalizedString;
    linkLabel: LocalizedString;
  };
}


export interface LegalSection {
  id: string;
  title: LocalizedString;
  paragraphs: LocalizedString[];
  listItems?: LocalizedString[];
}

export interface CookieInventoryItem {
  id: string;
  category: "necessary" | "admin" | "gallery" | "security" | "video" | "analytics" | "ads";
  name: LocalizedString;
  provider: LocalizedString;
  purpose: LocalizedString;
  duration: LocalizedString;
}

export interface LegalDocument {
  seoTitle: LocalizedString;
  seoDescription: LocalizedString;
  publicTitle: LocalizedString;
  intro: LocalizedString;
  sections: LegalSection[];
  version: number;
  effectiveDate: string | null;
  lastModified: string;
  inventory?: CookieInventoryItem[];
}

export interface LegalPageState {
  draft: LegalDocument;
  published: LegalDocument | null;
  history: LegalDocument[];
}

export interface LegalPagesContent {
  mentions: LegalPageState;
  privacy: LegalPageState;
  cgv: LegalPageState;
  cookies: LegalPageState;
}


export interface LegalUI {
  draftWarning: LocalizedString;
  hostedBy: LocalizedString;
  toBeDefined: LocalizedString;
  enterpriseNumber: LocalizedString;
  vatNumber: LocalizedString;
  effectiveDate: LocalizedString;
  unpublishedDraft: LocalizedString;
  cookiesInventoryTitle: LocalizedString;
  cookiesInventoryEmpty: LocalizedString;
  cookieColName: LocalizedString;
  cookieColProvider: LocalizedString;
  cookieColCategory: LocalizedString;
  cookieColPurpose: LocalizedString;
  cookieColDuration: LocalizedString;
  versionLabel: LocalizedString;
}

export interface SiteContent {
  legalUI: LegalUI;
  schemaVersion: 9;
  revision: string;
  updatedAt: string;
  business: BusinessContent;
  pricing: PricingCategory;
  home: HomeContent;
  pricingPage: PricingPageContent;
  aboutPage: AboutPageContent;
  contactPage: ContactPageContent;
  legalPages: LegalPagesContent;
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

function validateFormulaIncludedItem(data: unknown, context: string): FormulaIncludedItem {
  assertExactKeys(data, ["id", "text"], context);
  const obj = data as Record<string, unknown>;

  if (typeof obj.id !== "string" || obj.id.trim() === "") {
    throw new ValidationError(`Invalid id in ${context}`);
  }

  return {
    id: obj.id,
    text: validateLocalizedString(obj.text, `${context}.text`, 1000)
  };
}

function validateFormula(data: unknown, expectedId: string, context: string): Formula {
  assertExactKeys(data, ["id", "priceCents", "featured", "enabled", "name", "summary", "description", "includedItems", "buttonText"], context);

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

  const enabled = obj.enabled;
  if (typeof enabled !== "boolean") {
    throw new ValidationError(`Invalid enabled boolean in ${context}`);
  }

  if (!Array.isArray(obj.includedItems)) {
    throw new ValidationError(`includedItems must be an array in ${context}`);
  }

  return {
    id: expectedId as Formula["id"],
    priceCents,
    featured,
    enabled,
    name: validateLocalizedString(obj.name, `${context}.name`, 255),
    summary: validateLocalizedString(obj.summary, `${context}.summary`, 1000),
    description: validateLocalizedString(obj.description, `${context}.description`, 5000),
    includedItems: obj.includedItems.map((item, index) => validateFormulaIncludedItem(item, `${context}.includedItems[${index}]`)),
    buttonText: validateLocalizedString(obj.buttonText, `${context}.buttonText`, 255)
  };
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
    "legalName", "tradeName", "vatNumber",
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
    legalName: validateStringOrNull(obj.legalName, "legalName", 100),
    tradeName: validateStringOrNull(obj.tradeName, "tradeName", 100),
    vatNumber: validateStringOrNull(obj.vatNumber, "vatNumber", 50),
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


function validatePricingFaqItem(data: unknown, context: string): PricingFaqItem {
  assertExactKeys(data, ["id", "enabled", "question", "answer"], context);
  const obj = data as Record<string, unknown>;

  if (typeof obj.id !== "string" || obj.id.trim() === "") {
    throw new ValidationError(`Invalid id in ${context}`);
  }
  if (typeof obj.enabled !== "boolean") {
    throw new ValidationError(`Invalid enabled boolean in ${context}`);
  }

  return {
    id: obj.id,
    enabled: obj.enabled,
    question: validateLocalizedString(obj.question, `${context}.question`, 500),
    answer: validateLocalizedString(obj.answer, `${context}.answer`, 3000)
  };
}

function validatePricingPageContent(data: unknown): PricingPageContent {
  assertExactKeys(data, ["faqTitle", "faqs", "promoText", "promoTextBold", "caveat"], "pricingPage");
  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.faqs)) {
    throw new ValidationError("pricingPage.faqs must be an array");
  }
  if (obj.faqs.length > 20) {
    throw new ValidationError("pricingPage.faqs cannot exceed 20 items");
  }

  const faqs = obj.faqs.map((f, i) => validatePricingFaqItem(f, `pricingPage.faqs[${i}]`));
  const ids = new Set(faqs.map(f => f.id));
  if (ids.size !== faqs.length) {
    throw new ValidationError("pricingPage.faqs must have unique ids");
  }

  return {
    faqTitle: validateLocalizedString(obj.faqTitle, "pricingPage.faqTitle", 255),
    faqs,
    promoText: validateLocalizedString(obj.promoText, "pricingPage.promoText", 255),
    promoTextBold: validateLocalizedString(obj.promoTextBold, "pricingPage.promoTextBold", 255),
    caveat: validateLocalizedString(obj.caveat, "pricingPage.caveat", 255)
  };
}


function validateAboutPageContent(data: unknown): AboutPageContent {
  assertExactKeys(data, ["seo", "hero", "team", "approach", "difference"], "aboutPage");
  const obj = data as Record<string, unknown>;

  // SEO
  assertExactKeys(obj.seo, ["title", "description"], "aboutPage.seo");
  const seo = obj.seo as Record<string, unknown>;
  const validSeo = {
    title: validateLocalizedString(seo.title, "aboutPage.seo.title", 255),
    description: validateLocalizedString(seo.description, "aboutPage.seo.description", 1000)
  };

  // Hero
  assertExactKeys(obj.hero, ["title", "subtitle"], "aboutPage.hero");
  const hero = obj.hero as Record<string, unknown>;
  const validHero = {
    title: validateLocalizedString(hero.title, "aboutPage.hero.title", 255),
    subtitle: validateLocalizedString(hero.subtitle, "aboutPage.hero.subtitle", 1000)
  };

  // Team
  assertExactKeys(obj.team, ["members"], "aboutPage.team");
  const team = obj.team as Record<string, unknown>;
  if (!Array.isArray(team.members)) {
    throw new ValidationError("aboutPage.team.members must be an array");
  }
  if (team.members.length !== 2) {
    throw new ValidationError("aboutPage.team.members must contain exactly 2 members");
  }

  const validTeam = {
    members: team.members.map((m, i) => {
      assertExactKeys(m, ["id", "name", "role", "bio", "image"], `aboutPage.team.members[${i}]`);
      const mObj = m as Record<string, unknown>;
      if (mObj.id !== "photographer" && mObj.id !== "videographer") {
        throw new ValidationError(`aboutPage.team.members[${i}].id is invalid`);
      }
      return {
        id: mObj.id as "photographer" | "videographer",
        name: validateLocalizedString(mObj.name, `aboutPage.team.members[${i}].name`, 255),
        role: validateLocalizedString(mObj.role, `aboutPage.team.members[${i}].role`, 255),
        bio: validateLocalizedString(mObj.bio, `aboutPage.team.members[${i}].bio`, 3000),
        image: validateHomeImageMetadata(mObj.image, `aboutPage.team.members[${i}].image`)
      };
    })
  };

  const teamIds = new Set(validTeam.members.map(m => m.id));
  if (teamIds.size !== 2 || !teamIds.has("photographer") || !teamIds.has("videographer")) {
    throw new ValidationError("aboutPage.team.members must contain exactly 'photographer' and 'videographer'");
  }

  // Approach
  assertExactKeys(obj.approach, ["title", "principles"], "aboutPage.approach");
  const approach = obj.approach as Record<string, unknown>;
  if (!Array.isArray(approach.principles)) {
    throw new ValidationError("aboutPage.approach.principles must be an array");
  }
  if (approach.principles.length !== 3) {
    throw new ValidationError("aboutPage.approach.principles must contain exactly 3 items");
  }
  const validPrinciples = approach.principles.map((p, i) => {
    assertExactKeys(p, ["id", "title", "text"], `aboutPage.approach.principles[${i}]`);
    const pObj = p as Record<string, unknown>;
    if (typeof pObj.id !== "string" || !["discretion", "single-studio", "timeless"].includes(pObj.id)) {
      throw new ValidationError(`aboutPage.approach.principles[${i}].id is invalid`);
    }
    return {
      id: pObj.id,
      title: validateLocalizedString(pObj.title, `aboutPage.approach.principles[${i}].title`, 255),
      text: validateLocalizedString(pObj.text, `aboutPage.approach.principles[${i}].text`, 2000)
    };
  });

  // Verify that all 3 expected IDs are present and unique
  const ids = new Set(validPrinciples.map(p => p.id));
  if (ids.size !== 3 || !ids.has("discretion") || !ids.has("single-studio") || !ids.has("timeless")) {
     throw new ValidationError("aboutPage.approach.principles must contain exactly 'discretion', 'single-studio', and 'timeless'");
  }

  // Difference
  assertExactKeys(obj.difference, ["title", "text"], "aboutPage.difference");
  const diff = obj.difference as Record<string, unknown>;
  const validDiff = {
    title: validateLocalizedString(diff.title, "aboutPage.difference.title", 255),
    text: validateLocalizedString(diff.text, "aboutPage.difference.text", 3000)
  };

  return {
    seo: validSeo,
    hero: validHero,
    team: validTeam,
    approach: { title: validateLocalizedString(approach.title, "aboutPage.approach.title", 255), principles: validPrinciples },
    difference: validDiff
  };
}


function validateContactPageContent(data: unknown): ContactPageContent {
  assertExactKeys(data, ["seo", "hero", "introBanner", "bookingIntro", "visioBooking", "contactForm", "contactDetails", "bottomBanner"], "contactPage");
  const obj = data as Record<string, unknown>;

  // SEO
  assertExactKeys(obj.seo, ["title", "description"], "contactPage.seo");
  const seo = obj.seo as Record<string, unknown>;
  const validSeo = {
    title: validateLocalizedString(seo.title, "contactPage.seo.title", 120),
    description: validateLocalizedString(seo.description, "contactPage.seo.description", 300)
  };

  // Hero
  assertExactKeys(obj.hero, ["title", "subtitle"], "contactPage.hero");
  const hero = obj.hero as Record<string, unknown>;
  const validHero = {
    title: validateLocalizedString(hero.title, "contactPage.hero.title", 200),
    subtitle: validateLocalizedString(hero.subtitle, "contactPage.hero.subtitle", 2000)
  };

  // IntroBanner
  assertExactKeys(obj.introBanner, ["title", "subtitle", "badges"], "contactPage.introBanner");
  const intro = obj.introBanner as Record<string, unknown>;
  if (!Array.isArray(intro.badges) || intro.badges.length !== 3) {
    throw new ValidationError("contactPage.introBanner.badges must be an array of exactly 3 items");
  }
  const validBadges = intro.badges.map((b, i) => {
    assertExactKeys(b, ["id", "label"], `contactPage.introBanner.badges[${i}]`);
    const bObj = b as Record<string, unknown>;
    if (typeof bObj.id !== "string" || !["duration", "commitment", "format"].includes(bObj.id)) {
      throw new ValidationError(`contactPage.introBanner.badges[${i}].id is invalid`);
    }
    return {
      id: bObj.id,
      label: validateLocalizedString(bObj.label, `contactPage.introBanner.badges[${i}].label`, 120)
    };
  });
  const badgeIds = new Set(validBadges.map(b => b.id));
  if (badgeIds.size !== 3 || !badgeIds.has("duration") || !badgeIds.has("commitment") || !badgeIds.has("format")) {
    throw new ValidationError("contactPage.introBanner.badges must contain exactly 'duration', 'commitment', and 'format'");
  }

  // BookingIntro
  assertExactKeys(obj.bookingIntro, ["overtitle", "title", "description", "note"], "contactPage.bookingIntro");
  const bIntro = obj.bookingIntro as Record<string, unknown>;
  const validBookingIntro = {
    overtitle: validateLocalizedString(bIntro.overtitle, "contactPage.bookingIntro.overtitle", 120),
    title: validateLocalizedString(bIntro.title, "contactPage.bookingIntro.title", 200),
    description: validateLocalizedString(bIntro.description, "contactPage.bookingIntro.description", 2000),
    note: validateLocalizedString(bIntro.note, "contactPage.bookingIntro.note", 2000)
  };

  // VisioBooking
  assertExactKeys(obj.visioBooking, [
    "title", "unavailableMsg", "selectDate", "selectTime", "timezone",
    "formTitle", "labelNames", "labelEmail", "labelPhone", "labelWeddingDate",
    "labelFormula", "labelMessage", "formulas", "btnSubmit", "btnSubmitting",
    "successTitle", "successMsg", "btnNewRequest", "errTaken", "errGeneric", "loadingMsg"
  ], "contactPage.visioBooking");
  const visio = obj.visioBooking as Record<string, unknown>;

  assertExactKeys(visio.formulas, ["photo", "film", "duo", "custom", "unknown"], "contactPage.visioBooking.formulas");
  const visioFormulas = visio.formulas as Record<string, unknown>;

  const validVisioBooking = {
    title: validateLocalizedString(visio.title, "contactPage.visioBooking.title", 200),
    unavailableMsg: validateLocalizedString(visio.unavailableMsg, "contactPage.visioBooking.unavailableMsg", 2000),
    selectDate: validateLocalizedString(visio.selectDate, "contactPage.visioBooking.selectDate", 120),
    selectTime: validateLocalizedString(visio.selectTime, "contactPage.visioBooking.selectTime", 120),
    timezone: validateLocalizedString(visio.timezone, "contactPage.visioBooking.timezone", 120),
    formTitle: validateLocalizedString(visio.formTitle, "contactPage.visioBooking.formTitle", 200),
    labelNames: validateLocalizedString(visio.labelNames, "contactPage.visioBooking.labelNames", 120),
    labelEmail: validateLocalizedString(visio.labelEmail, "contactPage.visioBooking.labelEmail", 120),
    labelPhone: validateLocalizedString(visio.labelPhone, "contactPage.visioBooking.labelPhone", 120),
    labelWeddingDate: validateLocalizedString(visio.labelWeddingDate, "contactPage.visioBooking.labelWeddingDate", 120),
    labelFormula: validateLocalizedString(visio.labelFormula, "contactPage.visioBooking.labelFormula", 120),
    labelMessage: validateLocalizedString(visio.labelMessage, "contactPage.visioBooking.labelMessage", 120),
    formulas: {
      photo: validateLocalizedString(visioFormulas.photo, "contactPage.visioBooking.formulas.photo", 120),
      film: validateLocalizedString(visioFormulas.film, "contactPage.visioBooking.formulas.film", 120),
      duo: validateLocalizedString(visioFormulas.duo, "contactPage.visioBooking.formulas.duo", 120),
      custom: validateLocalizedString(visioFormulas.custom, "contactPage.visioBooking.formulas.custom", 120),
      unknown: validateLocalizedString(visioFormulas.unknown, "contactPage.visioBooking.formulas.unknown", 120)
    },
    btnSubmit: validateLocalizedString(visio.btnSubmit, "contactPage.visioBooking.btnSubmit", 120),
    btnSubmitting: validateLocalizedString(visio.btnSubmitting, "contactPage.visioBooking.btnSubmitting", 120),
    successTitle: validateLocalizedString(visio.successTitle, "contactPage.visioBooking.successTitle", 200),
    successMsg: validateLocalizedString(visio.successMsg, "contactPage.visioBooking.successMsg", 2000),
    btnNewRequest: validateLocalizedString(visio.btnNewRequest, "contactPage.visioBooking.btnNewRequest", 120),
    errTaken: validateLocalizedString(visio.errTaken, "contactPage.visioBooking.errTaken", 2000),
    errGeneric: validateLocalizedString(visio.errGeneric, "contactPage.visioBooking.errGeneric", 2000),
    loadingMsg: validateLocalizedString(visio.loadingMsg, "contactPage.visioBooking.loadingMsg", 200)
  };

  // ContactForm
  assertExactKeys(obj.contactForm, ["formPrompt", "successMsg", "btnSubmitting", "labels", "placeholders", "groupLabels", "options", "errors"], "contactPage.contactForm");
  const cForm = obj.contactForm as Record<string, unknown>;

  assertExactKeys(cForm.labels, ["names", "email", "phone", "date", "location", "formula", "message", "submit"], "contactPage.contactForm.labels");
  const cLabels = cForm.labels as Record<string, unknown>;

  assertExactKeys(cForm.placeholders, ["names", "email", "phone", "location", "formulaDefault", "message"], "contactPage.contactForm.placeholders");
  const cPlaceholders = cForm.placeholders as Record<string, unknown>;

  assertExactKeys(cForm.groupLabels, ["photo", "film", "duo"], "contactPage.contactForm.groupLabels");
  const cGroups = cForm.groupLabels as Record<string, unknown>;

  assertExactKeys(cForm.options, ["custom", "unknown"], "contactPage.contactForm.options");
  const cOptions = cForm.options as Record<string, unknown>;

  assertExactKeys(cForm.errors, [
    "invalidType", "invalidRequest", "payloadTooLarge", "readError", "invalidOrigin",
    "requiredFields", "maxLength", "invalidEmail", "invalidChars", "invalidFormula",
    "invalidDateFormat", "invalidDate", "invalidPhone", "invalidNetwork", "rateLimit", "sendError"
  ], "contactPage.contactForm.errors");
  const cErrors = cForm.errors as Record<string, unknown>;

  const validContactForm = {
    formPrompt: validateLocalizedString(cForm.formPrompt, "contactPage.contactForm.formPrompt", 2000),
    successMsg: validateLocalizedString(cForm.successMsg, "contactPage.contactForm.successMsg", 2000),
    btnSubmitting: validateLocalizedString(cForm.btnSubmitting, "contactPage.contactForm.btnSubmitting", 120),
    labels: {
      names: validateLocalizedString(cLabels.names, "contactPage.contactForm.labels.names", 120),
      email: validateLocalizedString(cLabels.email, "contactPage.contactForm.labels.email", 120),
      phone: validateLocalizedString(cLabels.phone, "contactPage.contactForm.labels.phone", 120),
      date: validateLocalizedString(cLabels.date, "contactPage.contactForm.labels.date", 120),
      location: validateLocalizedString(cLabels.location, "contactPage.contactForm.labels.location", 120),
      formula: validateLocalizedString(cLabels.formula, "contactPage.contactForm.labels.formula", 120),
      message: validateLocalizedString(cLabels.message, "contactPage.contactForm.labels.message", 120),
      submit: validateLocalizedString(cLabels.submit, "contactPage.contactForm.labels.submit", 120)
    },
    placeholders: {
      names: validateLocalizedString(cPlaceholders.names, "contactPage.contactForm.placeholders.names", 250),
      email: validateLocalizedString(cPlaceholders.email, "contactPage.contactForm.placeholders.email", 250),
      phone: validateLocalizedString(cPlaceholders.phone, "contactPage.contactForm.placeholders.phone", 250),
      location: validateLocalizedString(cPlaceholders.location, "contactPage.contactForm.placeholders.location", 250),
      formulaDefault: validateLocalizedString(cPlaceholders.formulaDefault, "contactPage.contactForm.placeholders.formulaDefault", 250),
      message: validateLocalizedString(cPlaceholders.message, "contactPage.contactForm.placeholders.message", 250)
    },
    groupLabels: {
      photo: validateLocalizedString(cGroups.photo, "contactPage.contactForm.groupLabels.photo", 120),
      film: validateLocalizedString(cGroups.film, "contactPage.contactForm.groupLabels.film", 120),
      duo: validateLocalizedString(cGroups.duo, "contactPage.contactForm.groupLabels.duo", 120)
    },
    options: {
      custom: validateLocalizedString(cOptions.custom, "contactPage.contactForm.options.custom", 120),
      unknown: validateLocalizedString(cOptions.unknown, "contactPage.contactForm.options.unknown", 120)
    },
    errors: {
      invalidType: validateLocalizedString(cErrors.invalidType, "contactPage.contactForm.errors.invalidType", 500),
      invalidRequest: validateLocalizedString(cErrors.invalidRequest, "contactPage.contactForm.errors.invalidRequest", 500),
      payloadTooLarge: validateLocalizedString(cErrors.payloadTooLarge, "contactPage.contactForm.errors.payloadTooLarge", 500),
      readError: validateLocalizedString(cErrors.readError, "contactPage.contactForm.errors.readError", 500),
      invalidOrigin: validateLocalizedString(cErrors.invalidOrigin, "contactPage.contactForm.errors.invalidOrigin", 500),
      requiredFields: validateLocalizedString(cErrors.requiredFields, "contactPage.contactForm.errors.requiredFields", 500),
      maxLength: validateLocalizedString(cErrors.maxLength, "contactPage.contactForm.errors.maxLength", 500),
      invalidEmail: validateLocalizedString(cErrors.invalidEmail, "contactPage.contactForm.errors.invalidEmail", 500),
      invalidChars: validateLocalizedString(cErrors.invalidChars, "contactPage.contactForm.errors.invalidChars", 500),
      invalidFormula: validateLocalizedString(cErrors.invalidFormula, "contactPage.contactForm.errors.invalidFormula", 500),
      invalidDateFormat: validateLocalizedString(cErrors.invalidDateFormat, "contactPage.contactForm.errors.invalidDateFormat", 500),
      invalidDate: validateLocalizedString(cErrors.invalidDate, "contactPage.contactForm.errors.invalidDate", 500),
      invalidPhone: validateLocalizedString(cErrors.invalidPhone, "contactPage.contactForm.errors.invalidPhone", 500),
      invalidNetwork: validateLocalizedString(cErrors.invalidNetwork, "contactPage.contactForm.errors.invalidNetwork", 500),
      rateLimit: validateLocalizedString(cErrors.rateLimit, "contactPage.contactForm.errors.rateLimit", 500),
      sendError: validateLocalizedString(cErrors.sendError, "contactPage.contactForm.errors.sendError", 500)
    }
  };

  // ContactDetails
  assertExactKeys(obj.contactDetails, ["title", "labelEmail", "labelPhone", "labelArea", "labelSocial", "labelInstagram", "labelLinkedin", "responseTime"], "contactPage.contactDetails");
  const cDetails = obj.contactDetails as Record<string, unknown>;
  const validContactDetails = {
    title: validateLocalizedString(cDetails.title, "contactPage.contactDetails.title", 200),
    labelEmail: validateLocalizedString(cDetails.labelEmail, "contactPage.contactDetails.labelEmail", 120),
    labelPhone: validateLocalizedString(cDetails.labelPhone, "contactPage.contactDetails.labelPhone", 120),
    labelArea: validateLocalizedString(cDetails.labelArea, "contactPage.contactDetails.labelArea", 120),
    labelSocial: validateLocalizedString(cDetails.labelSocial, "contactPage.contactDetails.labelSocial", 120),
    labelInstagram: validateLocalizedString(cDetails.labelInstagram, "contactPage.contactDetails.labelInstagram", 120),
    labelLinkedin: validateLocalizedString(cDetails.labelLinkedin, "contactPage.contactDetails.labelLinkedin", 120),
    responseTime: validateLocalizedString(cDetails.responseTime, "contactPage.contactDetails.responseTime", 250)
  };

  // BottomBanner
  assertExactKeys(obj.bottomBanner, ["text", "linkLabel"], "contactPage.bottomBanner");
  const bottom = obj.bottomBanner as Record<string, unknown>;
  const validBottomBanner = {
    text: validateLocalizedString(bottom.text, "contactPage.bottomBanner.text", 2000),
    linkLabel: validateLocalizedString(bottom.linkLabel, "contactPage.bottomBanner.linkLabel", 120)
  };

  return {
    seo: validSeo,
    hero: validHero,
    introBanner: { title: validateLocalizedString(intro.title, "contactPage.introBanner.title", 200), subtitle: validateLocalizedString(intro.subtitle, "contactPage.introBanner.subtitle", 2000), badges: validBadges },
    bookingIntro: validBookingIntro,
    visioBooking: validVisioBooking,
    contactForm: validContactForm,
    contactDetails: validContactDetails,
    bottomBanner: validBottomBanner
  };
}


export function validateLegalSection(data: unknown, context: string): LegalSection {
  assertExactKeys(data, ["id", "title", "paragraphs", "listItems"], context);
  const obj = data as Record<string, unknown>;

  if (typeof obj.id !== "string" || obj.id.trim() === "") {
    throw new ValidationError(`Invalid id in ${context}`);
  }

  const title = validateLocalizedString(obj.title, `${context}.title`, 255);

  if (!Array.isArray(obj.paragraphs)) {
    throw new ValidationError(`${context}.paragraphs must be an array`);
  }
  const paragraphs = obj.paragraphs.map((p, i) => validateLocalizedString(p, `${context}.paragraphs[${i}]`, 5000));

  let listItems: LocalizedString[] | undefined;
  if (obj.listItems !== undefined) {
    if (!Array.isArray(obj.listItems)) {
      throw new ValidationError(`${context}.listItems must be an array`);
    }
    listItems = obj.listItems.map((li, i) => validateLocalizedString(li, `${context}.listItems[${i}]`, 5000));
  }

  return { id: obj.id, title, paragraphs, listItems };
}

export function validateCookieInventoryItem(data: unknown, context: string): CookieInventoryItem {
  assertExactKeys(data, ["id", "category", "name", "provider", "purpose", "duration"], context);
  const obj = data as Record<string, unknown>;

  if (typeof obj.id !== "string" || obj.id.trim() === "") {
    throw new ValidationError(`Invalid id in ${context}`);
  }

  const validCategories = ["necessary", "admin", "gallery", "security", "video", "analytics", "ads"];
  if (typeof obj.category !== "string" || !validCategories.includes(obj.category)) {
    throw new ValidationError(`Invalid category in ${context}`);
  }

  return {
    id: obj.id,
    category: obj.category as CookieInventoryItem["category"],
    name: validateLocalizedString(obj.name, `${context}.name`, 255),
    provider: validateLocalizedString(obj.provider, `${context}.provider`, 255),
    purpose: validateLocalizedString(obj.purpose, `${context}.purpose`, 1000),
    duration: validateLocalizedString(obj.duration, `${context}.duration`, 255)
  };
}

export function validateLegalDocument(data: unknown, context: string): LegalDocument {
  assertExactKeys(data, ["seoTitle", "seoDescription", "publicTitle", "intro", "sections", "version", "effectiveDate", "lastModified", "inventory"], context);
  const obj = data as Record<string, unknown>;

  if (typeof obj.version !== "number" || !Number.isInteger(obj.version) || obj.version < 1) {
    throw new ValidationError(`${context}.version must be a positive integer`);
  }

  let effectiveDate: string | null = null;
  if (obj.effectiveDate !== null) {
    if (typeof obj.effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/.test(obj.effectiveDate)) {
      throw new ValidationError(`${context}.effectiveDate must be a valid ISO string or YYYY-MM-DD`);
    }
    effectiveDate = obj.effectiveDate;
  }

  if (typeof obj.lastModified !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(obj.lastModified)) {
    throw new ValidationError(`${context}.lastModified must be a valid ISO datetime string`);
  }

  if (!Array.isArray(obj.sections)) {
    throw new ValidationError(`${context}.sections must be an array`);
  }

  const sections = obj.sections.map((s, i) => validateLegalSection(s, `${context}.sections[${i}]`));

  let inventory: CookieInventoryItem[] | undefined;
  if (obj.inventory !== undefined) {
    if (!Array.isArray(obj.inventory)) {
      throw new ValidationError(`${context}.inventory must be an array`);
    }
    inventory = obj.inventory.map((item, i) => validateCookieInventoryItem(item, `${context}.inventory[${i}]`));
  }

  return {
    seoTitle: validateLocalizedString(obj.seoTitle, `${context}.seoTitle`, 255),
    seoDescription: validateLocalizedString(obj.seoDescription, `${context}.seoDescription`, 1000),
    publicTitle: validateLocalizedString(obj.publicTitle, `${context}.publicTitle`, 255),
    intro: validateLocalizedString(obj.intro, `${context}.intro`, 5000),
    sections,
    version: obj.version,
    effectiveDate,
    lastModified: obj.lastModified,
    inventory
  };
}

export function validateLegalPageState(data: unknown, context: string): LegalPageState {
  assertExactKeys(data, ["draft", "published", "history"], context);
  const obj = data as Record<string, unknown>;

  const draft = validateLegalDocument(obj.draft, `${context}.draft`);

  let published: LegalDocument | null = null;
  if (obj.published !== null) {
    published = validateLegalDocument(obj.published, `${context}.published`);
  }

  if (!Array.isArray(obj.history)) {
    throw new ValidationError(`${context}.history must be an array`);
  }
  const history = obj.history.map((h, i) => validateLegalDocument(h, `${context}.history[${i}]`));

  return { draft, published, history };
}

export
function validateLegalUI(obj: unknown): LegalUI {
  assertExactKeys(obj, [
    "draftWarning", "hostedBy", "toBeDefined", "enterpriseNumber", "vatNumber",
    "effectiveDate", "unpublishedDraft", "cookiesInventoryTitle", "cookiesInventoryEmpty",
    "cookieColName", "cookieColProvider", "cookieColCategory", "cookieColPurpose", "cookieColDuration", "versionLabel"
  ], "legalUI");
  const o = obj as Record<string, unknown>;
  return {
    draftWarning: validateLocalizedString(o.draftWarning, "legalUI.draftWarning"),
    hostedBy: validateLocalizedString(o.hostedBy, "legalUI.hostedBy"),
    toBeDefined: validateLocalizedString(o.toBeDefined, "legalUI.toBeDefined"),
    enterpriseNumber: validateLocalizedString(o.enterpriseNumber, "legalUI.enterpriseNumber"),
    vatNumber: validateLocalizedString(o.vatNumber, "legalUI.vatNumber"),
    effectiveDate: validateLocalizedString(o.effectiveDate, "legalUI.effectiveDate"),
    unpublishedDraft: validateLocalizedString(o.unpublishedDraft, "legalUI.unpublishedDraft"),
    cookiesInventoryTitle: validateLocalizedString(o.cookiesInventoryTitle, "legalUI.cookiesInventoryTitle"),
    cookiesInventoryEmpty: validateLocalizedString(o.cookiesInventoryEmpty, "legalUI.cookiesInventoryEmpty"),
    cookieColName: validateLocalizedString(o.cookieColName, "legalUI.cookieColName"),
    cookieColProvider: validateLocalizedString(o.cookieColProvider, "legalUI.cookieColProvider"),
    cookieColCategory: validateLocalizedString(o.cookieColCategory, "legalUI.cookieColCategory"),
    cookieColPurpose: validateLocalizedString(o.cookieColPurpose, "legalUI.cookieColPurpose"),
    cookieColDuration: validateLocalizedString(o.cookieColDuration, "legalUI.cookieColDuration"),
    versionLabel: validateLocalizedString(o.versionLabel, "legalUI.versionLabel"),
  };
}

function validateLegalPagesContent(data: unknown): LegalPagesContent {
  assertExactKeys(data, ["mentions", "privacy", "cgv", "cookies"], "legalPages");
  const obj = data as Record<string, unknown>;
  return {
    mentions: validateLegalPageState(obj.mentions, "legalPages.mentions"),
    privacy: validateLegalPageState(obj.privacy, "legalPages.privacy"),
    cgv: validateLegalPageState(obj.cgv, "legalPages.cgv"),
    cookies: validateLegalPageState(obj.cookies, "legalPages.cookies")
  };
}

export function validateSiteContent(data: unknown): SiteContent {
  if (typeof data !== "object" || data === null) {
    throw new ValidationError("root must be an object");
  }
  const obj = data as Record<string, unknown>;

  if (obj.schemaVersion !== 1 && obj.schemaVersion !== 2 && obj.schemaVersion !== 3 && obj.schemaVersion !== 4 && obj.schemaVersion !== 5 && obj.schemaVersion !== 6 && obj.schemaVersion !== 7 && obj.schemaVersion !== 8 && obj.schemaVersion !== 9) {
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

  const objCopy = JSON.parse(JSON.stringify(obj));
  let objRef = objCopy;
  const homeData = objCopy.home !== undefined ? objCopy.home : JSON.parse(JSON.stringify(defaultContent.home));
  const migratedHomeData = homeData && typeof homeData === "object" ? { ...(homeData as Record<string, unknown>) } : {};
  let needsHomeMigration = false;

  if (homeData && typeof homeData === "object") {
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
      needsHomeMigration = true;
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
      needsHomeMigration = true;
    }

    if (migratedHomeData.studio) {
      const studio = migratedHomeData.studio as Record<string, unknown>;
      migratedHomeData.studio = { ...studio };
      if (!(migratedHomeData.studio as Record<string, unknown>).alt) {
        (migratedHomeData.studio as Record<string, unknown>).alt = { fr: "Image", en: "Image" };
        needsHomeMigration = true;
      }
      if ((migratedHomeData.studio as Record<string, unknown>).imageId === null && !(migratedHomeData.studio as Record<string, unknown>).variants) {
        (migratedHomeData.studio as Record<string, unknown>).variants = [];
        needsHomeMigration = true;
      }
    }
  }

  let rawPricing = obj.pricing as Record<string, unknown>;

  if (obj.schemaVersion === 1 || obj.schemaVersion === 2) {
    const pp = (migratedHomeData.pricingPreview || {}) as Record<string, unknown>;

    // Resolve V1 -> V2 intermediate fields
    if ("essentialDescription" in pp && !("photoEssentialDescription" in pp)) {
      pp.photoEssentialDescription = pp.essentialDescription;
      pp.photoSignatureDescription = pp.signatureDescription;
      pp.photoPrestigeDescription = pp.prestigeDescription;

    }




    const migrateCategory = (catData: unknown, prefix: keyof typeof defaultContent.pricing): unknown[] => {
      if (!Array.isArray(catData)) return [];

      return catData.map((f) => {
        if (typeof f !== "object" || f === null) return f;
        const fRecord = f as Record<string, unknown>;
        const id = typeof fRecord.id === "string" ? fRecord.id : "";
        let descKey = "";
        if (id === "essential") descKey = prefix + "EssentialDescription";
        if (id === "signature") descKey = prefix + "SignatureDescription";
        if (id === "prestige") descKey = prefix + "PrestigeDescription";

        const defaultCat = defaultContent.pricing[prefix] || [];
        const fallback = defaultCat.find(d => d.id === id);

        if (!fallback) {
          throw new ValidationError(`Unknown formula id '${id}' in category '${prefix}'`);
        }

        const includedItems = fallback.includedItems.map((item, itemIdx) => ({
          ...item,
          id: `${prefix}-${id}-${itemIdx}`
        }));

        const val = pp[descKey] as { fr?: string, en?: string } | undefined;
        const summaryFr = val?.fr || fallback.summary.fr;
        const summaryEn = val?.en || fallback.summary.en;

        const priceCents = typeof fRecord.priceCents === "number" ? fRecord.priceCents : fallback.priceCents;
        const featured = typeof fRecord.featured === "boolean" ? fRecord.featured : fallback.featured;

        return {
          id,
          priceCents,
          featured,
          enabled: true,
          name: JSON.parse(JSON.stringify(fallback.name)),
          summary: { fr: summaryFr, en: summaryEn },
          description: JSON.parse(JSON.stringify(fallback.description)),
          includedItems,
          buttonText: JSON.parse(JSON.stringify(fallback.buttonText))
        };
      });
    };

    rawPricing = {
      photo: migrateCategory(rawPricing.photo, "photo"),
      film: migrateCategory(rawPricing.film, "film"),
      duo: migrateCategory(rawPricing.duo, "duo")
    };

    // Cleanup V2 pricingPreview from home
    const cleanedPp = { ...pp };
    delete cleanedPp.essentialDescription;
    delete cleanedPp.signatureDescription;
    delete cleanedPp.prestigeDescription;
    delete cleanedPp.photoEssentialDescription;
    delete cleanedPp.photoSignatureDescription;
    delete cleanedPp.photoPrestigeDescription;
    delete cleanedPp.filmEssentialDescription;
    delete cleanedPp.filmSignatureDescription;
    delete cleanedPp.filmPrestigeDescription;
    delete cleanedPp.duoEssentialDescription;
    delete cleanedPp.duoSignatureDescription;
    delete cleanedPp.duoPrestigeDescription;

    migratedHomeData.pricingPreview = cleanedPp;
    needsHomeMigration = true;
  }

  if (needsHomeMigration) {
    objRef = { ...obj, home: migratedHomeData };
  }


  if (obj.schemaVersion === 1 || obj.schemaVersion === 2 || obj.schemaVersion === 3) {
    const pricingPageData = JSON.parse(JSON.stringify(defaultContent.pricingPage));
    objRef = { ...objRef, pricingPage: pricingPageData };
  }


  if (obj.schemaVersion === 1 || obj.schemaVersion === 2 || obj.schemaVersion === 3 || obj.schemaVersion === 4) {
    const aboutPageData = JSON.parse(JSON.stringify(defaultContent.aboutPage));
    objRef = { ...objRef, aboutPage: aboutPageData };
  }

  if ((obj.schemaVersion as number) < 6) {
    const defaultPricingPage = JSON.parse(JSON.stringify(defaultContent.pricingPage));
    const currentPricingPage = objRef.pricingPage as Record<string, unknown>;
    objRef = {
      ...objRef,
      pricingPage: {
        ...currentPricingPage,
        promoText: currentPricingPage.promoText || defaultPricingPage.promoText,
        promoTextBold: currentPricingPage.promoTextBold || defaultPricingPage.promoTextBold,
        caveat: currentPricingPage.caveat || defaultPricingPage.caveat
      }
    };
  }

  if ((obj.schemaVersion as number) < 7) {
    const defaultAboutPage = JSON.parse(JSON.stringify(defaultContent.aboutPage));
    const currentAboutPage = objRef.aboutPage as Record<string, unknown>;

    let migratedTeam = defaultAboutPage.team;

    // Attempt to migrate the single member to the first slot if data exists
    if (currentAboutPage.team && (currentAboutPage.team as Record<string, unknown>).name && !(currentAboutPage.team as Record<string, unknown>).members) {
      const oldTeam = currentAboutPage.team as Record<string, unknown>;
      migratedTeam = {
        members: [
          {
            id: "photographer",
            name: oldTeam.name,
            role: oldTeam.role,
            bio: oldTeam.bio,
            image: oldTeam.image,
          },
          {
            ...defaultAboutPage.team.members[1],
            id: "videographer"
          }
        ]
      };
    }

    objRef = {
      ...objRef,
      aboutPage: {
        ...currentAboutPage,
        team: migratedTeam
      }
    };
  }


  if ((obj.schemaVersion as number) < 8) {
    const defaultContactPage = JSON.parse(JSON.stringify(defaultContent.contactPage));
    objRef = {
      ...objRef,
      contactPage: defaultContactPage
    };
  }



  if ((obj.schemaVersion as number) < 9 || (obj.schemaVersion as number) === 9 && !('legalUI' in objRef)) {
    const defaultLegalPages = JSON.parse(JSON.stringify(defaultContent.legalPages));
    objRef = {
      ...objRef,
      legalPages: 'legalPages' in objRef ? objRef.legalPages : defaultLegalPages,
      legalUI: 'legalUI' in objRef ? objRef.legalUI : JSON.parse(JSON.stringify(defaultContent.legalUI)),
    };


    // Default business variables were added in V9
    const currentBusiness = objRef.business as Record<string, unknown>;
    objRef.business = {
      ...currentBusiness,
      legalName: currentBusiness.legalName ?? null,
      tradeName: currentBusiness.tradeName ?? "Sempra",
      vatNumber: currentBusiness.vatNumber ?? null
    };
  }

  assertExactKeys(objRef, ["schemaVersion", "revision", "updatedAt", "business", "pricing", "home", "pricingPage", "aboutPage", "contactPage", "legalPages", "legalUI"], "root");



  const pricing = validatePricing(rawPricing);
  const home = validateHomeContent(objRef.home);

  return {
    schemaVersion: 9,
    revision: obj.revision,
    updatedAt: updatedAtStr,
    business,
    pricing,
    home,
    pricingPage: validatePricingPageContent(objRef.pricingPage),
    aboutPage: validateAboutPageContent(objRef.aboutPage),
    contactPage: validateContactPageContent(objRef.contactPage),
    legalPages: validateLegalPagesContent(objRef.legalPages),
    legalUI: validateLegalUI(objRef.legalUI),
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
  } catch (e) {
    console.error("VALIDATION ERROR IN GETRAWSITECONTENT:", e);
    return { content: validateSiteContent(defaultContent), isCorrupted: true };
  }
  return { content: validateSiteContent(defaultContent), isCorrupted: false };
}

import { atomicWriteJson } from "./atomic-fs.server";


export function savePricingAndFaq(pricing: PricingCategory, pricingPage: PricingPageContent, previousRevision: string) {
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
    pricingPage: validatePricingPageContent(pricingPage),
  };

  atomicWriteJson(getFilePath(), newContent);
  return newContent.revision;
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


export function saveAboutPageSettings(aboutPage: AboutPageContent, previousRevision: string) {
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
    aboutPage: validateAboutPageContent(aboutPage),
  };

  atomicWriteJson(getFilePath(), newContent);
  return newContent.revision;
}

export function saveContactPageSettings(contactPage: ContactPageContent, previousRevision: string) {
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
    contactPage: validateContactPageContent(contactPage),
  };

  atomicWriteJson(getFilePath(), newContent);
  return newContent.revision;
}


export function saveLegalUI(legalUI: LegalUI, previousRevision: string) {
  const current = getRawSiteContent();
  if (current.isCorrupted) throw new CorruptedContentError();
  if (current.content.revision !== previousRevision) throw new RevisionConflictError();

  const validated = validateLegalUI(legalUI);
  const nextRevision = crypto.randomBytes(16).toString("hex");

  const newContent: SiteContent = {
    ...current.content,
    revision: nextRevision,
    updatedAt: new Date().toISOString(),
    legalUI: validated
  };
  atomicWriteJson(getFilePath(), newContent);
  return newContent.revision;
}

export function saveLegalPageDraft(key: keyof LegalPagesContent, draft: LegalDocument, previousRevision: string) {
  const current = getRawSiteContent();
  if (current.isCorrupted) throw new CorruptedContentError();
  if (current.content.revision !== previousRevision) throw new RevisionConflictError();

  draft.lastModified = new Date().toISOString();
  const validatedDraft = validateLegalDocument(draft, `legalPages.${key}.draft`);

  const newContent: SiteContent = {
    ...current.content,
    revision: crypto.randomBytes(16).toString("hex"),
    updatedAt: new Date().toISOString(),
    legalPages: {
      ...current.content.legalPages,
      [key]: {
        ...current.content.legalPages[key],
        draft: validatedDraft
      }
    }
  };

  atomicWriteJson(getFilePath(), newContent);
  return newContent.revision;
}

export function publishLegalPage(key: keyof LegalPagesContent, draftToPublish: LegalDocument, previousRevision: string) {
  const current = getRawSiteContent();
  if (current.isCorrupted) throw new CorruptedContentError();
  if (current.content.revision !== previousRevision) throw new RevisionConflictError();

  draftToPublish.lastModified = new Date().toISOString();
  const validatedDraft = validateLegalDocument(draftToPublish, `legalPages.${key}.draft`);

  if (!validatedDraft.effectiveDate) {
    throw new ValidationError("effectiveDate is required to publish");
  }

  const oldPublished = current.content.legalPages[key].published;
  const newHistory = [...current.content.legalPages[key].history];

  if (oldPublished) {
    newHistory.push(oldPublished);
  }

  const newPublished: LegalDocument = {
    ...validatedDraft,
    version: (oldPublished ? oldPublished.version + 1 : 1)
  };

  const newContent: SiteContent = {
    ...current.content,
    revision: crypto.randomBytes(16).toString("hex"),
    updatedAt: new Date().toISOString(),
    legalPages: {
      ...current.content.legalPages,
      [key]: {
        draft: newPublished, // Current draft becomes identical to published
        published: newPublished,
        history: newHistory
      }
    }
  };

  atomicWriteJson(getFilePath(), newContent);
  return newContent.revision;
}
