import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateSiteContent } from "../app/lib/site-content.server";
import {
  applyLegalDrafts,
  areDraftsEqual,
  rotateBackups,
} from "../scripts/apply-legal-drafts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultContentPath = path.resolve(__dirname, "../app/content/default-site-content.json");
const activeContentPath = path.resolve(__dirname, "../data/site-content.json");

const LONG_DASHES = [
  String.fromCodePoint(0x2013), // en-dash
  String.fromCodePoint(0x2014), // em-dash
];

interface MinimalHistoryItem {
  version: number;
  effectiveDate: string | null;
  lastModified: string;
  seoTitle: { fr: string; en: string };
  seoDescription: { fr: string; en: string };
  publicTitle: { fr: string; en: string };
  intro: { fr: string; en: string };
  sections: Array<{
    id: string;
    title: { fr: string; en: string };
    paragraphs: Array<{ fr: string; en: string }>;
  }>;
}

function scanObjectForLongDashes(obj: unknown, loc = "root"): void {
  if (typeof obj === "string") {
    for (const dash of LONG_DASHES) {
      if (obj.includes(dash)) {
        throw new Error(`Forbidden long dash found at ${loc}: "${obj.slice(0, 30)}..."`);
      }
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, i) => scanObjectForLongDashes(item, `${loc}[${i}]`));
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      scanObjectForLongDashes(v, `${loc}.${k}`);
    }
  }
}

function scanObjectForDangerousHtml(obj: unknown, loc = "root"): void {
  if (typeof obj === "string") {
    const lower = obj.toLowerCase();
    if (lower.includes("<script") || lower.includes("javascript:") || lower.includes("<iframe") || lower.includes("onload=")) {
      throw new Error(`Dangerous HTML/URL pattern found at ${loc}: "${obj.slice(0, 40)}"`);
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, i) => scanObjectForDangerousHtml(item, `${loc}[${i}]`));
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      scanObjectForDangerousHtml(v, `${loc}.${k}`);
    }
  }
}

describe("Legal Pages Drafts and Content Integrity", () => {
  const defaultRaw = fs.readFileSync(defaultContentPath, "utf-8");
  const defaultJson = JSON.parse(defaultRaw);

  const activeRaw = fs.existsSync(activeContentPath)
    ? fs.readFileSync(activeContentPath, "utf-8")
    : defaultRaw;
  const activeJson = JSON.parse(activeRaw);

  it("passes strict schema validation through validateSiteContent", () => {
    const validated = validateSiteContent(defaultJson);
    expect(validated.schemaVersion).toBe(11);
    expect(validated.legalPages).toBeDefined();

    if (fs.existsSync(activeContentPath)) {
      const activeValidated = validateSiteContent(activeJson);
      expect(activeValidated.schemaVersion).toBe(11);
      expect(activeValidated.legalPages).toBeDefined();
    }
  });

  it("applies the four drafts to the active content file and matches default blueprint", () => {
    const pages = ["mentions", "privacy", "cgv", "cookies"] as const;
    for (const pageKey of pages) {
      const activeDraft = activeJson.legalPages[pageKey]?.draft;
      const blueprintDraft = defaultJson.legalPages[pageKey]?.draft;

      expect(activeDraft, `Active draft for ${pageKey} should exist`).toBeDefined();
      expect(areDraftsEqual(activeDraft, blueprintDraft)).toBe(true);
    }
  });

  it("strictly preserves published and history in active content (no automatic publishing)", () => {
    const pages = ["mentions", "privacy", "cgv", "cookies"] as const;
    for (const pageKey of pages) {
      const page = activeJson.legalPages[pageKey];
      expect(page.published).toBeNull();
      expect(page.draft.effectiveDate).toBeNull();
      expect(Array.isArray(page.history)).toBe(true);
    }
  });

  it("preserves business, pricing, and other non-legal sections intact", () => {
    // Capturer le document actif avant l'application des brouillons
    const beforeContent = JSON.parse(JSON.stringify(activeJson));

    const tempDir = path.resolve(__dirname, `../data/temp-preserve-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const targetFile = path.join(tempDir, "active-content-preserve.json");

    try {
      fs.writeFileSync(targetFile, JSON.stringify(beforeContent, null, 2), "utf-8");

      const applyRes = applyLegalDrafts({ targetFilePath: targetFile, apply: true });
      expect(applyRes.success).toBe(true);

      const afterContent = JSON.parse(fs.readFileSync(targetFile, "utf-8"));

      // Vérifier que business et toutes les sections non légales sont strictement identiques avant et après
      expect(afterContent.business).toEqual(beforeContent.business);
      expect(afterContent.pricing).toEqual(beforeContent.pricing);
      expect(afterContent.home).toEqual(beforeContent.home);
      expect(afterContent.aboutPage).toEqual(beforeContent.aboutPage);
      expect(afterContent.contactPage).toEqual(beforeContent.contactPage);
      expect(afterContent.pricingPage).toEqual(beforeContent.pricingPage);
      expect(afterContent.legalUI).toEqual(beforeContent.legalUI);

      // Ne contenir aucune adresse métier codée en dur : vérifier la cohérence dynamique de l'email
      expect(typeof afterContent.business.email).toBe("string");
      expect(afterContent.business.email.length).toBeGreaterThan(0);
      expect(afterContent.business.email).toBe(beforeContent.business.email);

      // Vérifier que seules les zones légales attendues changent (drafts mis à jour, published et history inchangés)
      const pages = ["mentions", "privacy", "cgv", "cookies"] as const;
      for (const pageKey of pages) {
        expect(afterContent.legalPages[pageKey].published).toEqual(beforeContent.legalPages[pageKey].published);
        expect(afterContent.legalPages[pageKey].history).toEqual(beforeContent.legalPages[pageKey].history);
        expect(areDraftsEqual(afterContent.legalPages[pageKey].draft, defaultJson.legalPages[pageKey].draft)).toBe(true);
      }

      // Continuer à garantir l'idempotence et l'absence de publication automatique
      for (const pageKey of pages) {
        expect(afterContent.legalPages[pageKey].published).toBeNull();
        expect(afterContent.legalPages[pageKey].draft.effectiveDate).toBeNull();
      }

      const secondRes = applyLegalDrafts({ targetFilePath: targetFile, apply: true });
      expect(secondRes.success).toBe(true);
      expect(secondRes.applied).toBe(false);
      expect(secondRes.alreadyUpToDate).toBe(true);
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("rejects content missing legalPages without creating backup or writing", () => {
    const tempDir = path.resolve(__dirname, `../data/temp-err-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const targetFile = path.join(tempDir, "no-legal-pages.json");
    try {
      const invalidData = {
        schemaVersion: 11,
        revision: "0123456789abcdef0123456789abcdef",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      fs.writeFileSync(targetFile, JSON.stringify(invalidData, null, 2), "utf-8");

      expect(() => {
        applyLegalDrafts({ targetFilePath: targetFile, apply: true });
      }).toThrow(/legalPages must be an object/);

      const filesInDir = fs.readdirSync(tempDir);
      expect(filesInDir.filter((f) => f.endsWith(".bak"))).toHaveLength(0);
      expect(JSON.parse(fs.readFileSync(targetFile, "utf-8"))).toEqual(invalidData);
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("rejects content where a legal page lacks history property without creating backup or writing", () => {
    const tempDir = path.resolve(__dirname, `../data/temp-err-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const targetFile = path.join(tempDir, "no-history.json");
    try {
      const invalidData = {
        ...defaultJson,
        legalPages: {
          ...defaultJson.legalPages,
          mentions: {
            draft: defaultJson.legalPages.mentions.draft,
            published: null,
          },
        },
      };
      fs.writeFileSync(targetFile, JSON.stringify(invalidData, null, 2), "utf-8");

      expect(() => {
        applyLegalDrafts({ targetFilePath: targetFile, apply: true });
      }).toThrow(/must contain a history property/);

      const filesInDir = fs.readdirSync(tempDir);
      expect(filesInDir.filter((f) => f.endsWith(".bak"))).toHaveLength(0);
      expect(JSON.parse(fs.readFileSync(targetFile, "utf-8"))).toEqual(invalidData);
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("rejects content where history is not an array", () => {
    const tempDir = path.resolve(__dirname, `../data/temp-err-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const targetFile = path.join(tempDir, "invalid-history.json");
    try {
      const invalidData = {
        ...defaultJson,
        legalPages: {
          ...defaultJson.legalPages,
          privacy: {
            draft: defaultJson.legalPages.privacy.draft,
            published: null,
            history: "invalid-not-an-array",
          },
        },
      };
      fs.writeFileSync(targetFile, JSON.stringify(invalidData, null, 2), "utf-8");

      expect(() => {
        applyLegalDrafts({ targetFilePath: targetFile, apply: true });
      }).toThrow(/history must be an array/);

      const filesInDir = fs.readdirSync(tempDir);
      expect(filesInDir.filter((f) => f.endsWith(".bak"))).toHaveLength(0);
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("rejects content where published property is invalid", () => {
    const tempDir = path.resolve(__dirname, `../data/temp-err-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const targetFile = path.join(tempDir, "invalid-published.json");
    try {
      const invalidData = {
        ...defaultJson,
        legalPages: {
          ...defaultJson.legalPages,
          cgv: {
            draft: defaultJson.legalPages.cgv.draft,
            published: {
              invalidDoc: true,
              version: "not-a-number",
            },
            history: [],
          },
        },
      };
      fs.writeFileSync(targetFile, JSON.stringify(invalidData, null, 2), "utf-8");

      expect(() => {
        applyLegalDrafts({ targetFilePath: targetFile, apply: true });
      }).toThrow(/Invalid legalPages\.cgv\.published/);

      const filesInDir = fs.readdirSync(tempDir);
      expect(filesInDir.filter((f) => f.endsWith(".bak"))).toHaveLength(0);
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("rejects missing or invalid source drafts", () => {
    const tempDir = path.resolve(__dirname, `../data/temp-err-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const targetFile = path.join(tempDir, "target.json");
    try {
      fs.writeFileSync(targetFile, JSON.stringify(defaultJson, null, 2), "utf-8");

      const incompleteDrafts: Record<string, unknown> = {
        mentions: {
          ...defaultJson.legalPages.mentions.draft,
          sections: [],
        },
        privacy: defaultJson.legalPages.privacy.draft,
        cgv: defaultJson.legalPages.cgv.draft,
        cookies: defaultJson.legalPages.cookies.draft,
      };

      expect(() => {
        applyLegalDrafts({
          targetFilePath: targetFile,
          drafts: incompleteDrafts,
          apply: true,
        });
      }).toThrow(/sections must not be empty/);
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("strictly preserves published property by exact structural identity without normalization", () => {
    const tempDir = path.resolve(__dirname, `../data/temp-test-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const targetFile = path.join(tempDir, "preserve-published.json");

    try {
      const customPublished: MinimalHistoryItem = {
        version: 4,
        effectiveDate: "2026-06-01",
        lastModified: "2026-06-01T12:00:00.000Z",
        seoTitle: { fr: "Titre Publie FR", en: "Published Title EN" },
        seoDescription: { fr: "Desc FR", en: "Desc EN" },
        publicTitle: { fr: "Publie FR", en: "Published EN" },
        intro: { fr: "Intro FR", en: "Intro EN" },
        sections: [
          {
            id: "custom-section",
            title: { fr: "Titre Sec", en: "Sec Title" },
            paragraphs: [{ fr: "Contenu", en: "Content" }],
          },
        ],
      };

      const initialData = {
        ...defaultJson,
        legalPages: {
          ...defaultJson.legalPages,
          cgv: {
            draft: {
              ...defaultJson.legalPages.cgv.draft,
              publicTitle: { fr: "Ancien Brouillon", en: "Old Draft" },
            },
            published: customPublished,
            history: [],
          },
        },
      };

      fs.writeFileSync(targetFile, JSON.stringify(initialData, null, 2), "utf-8");

      const applyRes = applyLegalDrafts({ targetFilePath: targetFile, apply: true });
      expect(applyRes.applied).toBe(true);

      const afterData = JSON.parse(fs.readFileSync(targetFile, "utf-8"));
      expect(afterData.legalPages.cgv.published).toEqual(customPublished);
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("strictly preserves history property by exact structural identity without normalization", () => {
    const tempDir = path.resolve(__dirname, `../data/temp-test-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const targetFile = path.join(tempDir, "preserve-history.json");

    try {
      const historyItem1: MinimalHistoryItem = {
        version: 1,
        effectiveDate: "2025-01-01",
        lastModified: "2025-01-01T00:00:00.000Z",
        seoTitle: { fr: "V1 FR", en: "V1 EN" },
        seoDescription: { fr: "Desc 1", en: "Desc 1" },
        publicTitle: { fr: "Titre V1", en: "Title V1" },
        intro: { fr: "Intro 1", en: "Intro 1" },
        sections: [],
      };
      const historyItem2: MinimalHistoryItem = {
        version: 2,
        effectiveDate: "2025-06-01",
        lastModified: "2025-06-01T00:00:00.000Z",
        seoTitle: { fr: "V2 FR", en: "V2 EN" },
        seoDescription: { fr: "Desc 2", en: "Desc 2" },
        publicTitle: { fr: "Titre V2", en: "Title V2" },
        intro: { fr: "Intro 2", en: "Intro 2" },
        sections: [],
      };
      const customHistory = [historyItem1, historyItem2];

      const initialData = {
        ...defaultJson,
        legalPages: {
          ...defaultJson.legalPages,
          privacy: {
            draft: {
              ...defaultJson.legalPages.privacy.draft,
              publicTitle: { fr: "Ancien Brouillon", en: "Old Draft" },
            },
            published: null,
            history: customHistory,
          },
        },
      };

      fs.writeFileSync(targetFile, JSON.stringify(initialData, null, 2), "utf-8");

      const applyRes = applyLegalDrafts({ targetFilePath: targetFile, apply: true });
      expect(applyRes.applied).toBe(true);

      const afterData = JSON.parse(fs.readFileSync(targetFile, "utf-8"));
      expect(afterData.legalPages.privacy.history).toEqual(customHistory);
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("strictly preserves business and all non-legal sections untouched", () => {
    const tempDir = path.resolve(__dirname, `../data/temp-test-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const targetFile = path.join(tempDir, "preserve-non-legal.json");

    try {
      const customBusiness = {
        ...defaultJson.business,
        email: "unique-admin@sempra.be",
        depositPercent: 45,
      };
      const customPricing = { ...defaultJson.pricing };
      const customHome = { ...defaultJson.home };
      const customAboutPage = { ...defaultJson.aboutPage };
      const customContactPage = { ...defaultJson.contactPage };
      const customPricingPage = { ...defaultJson.pricingPage };
      const customLegalUI = { ...defaultJson.legalUI };

      const initialData = {
        ...defaultJson,
        business: customBusiness,
        pricing: customPricing,
        home: customHome,
        aboutPage: customAboutPage,
        contactPage: customContactPage,
        pricingPage: customPricingPage,
        legalUI: customLegalUI,
        legalPages: {
          ...defaultJson.legalPages,
          mentions: {
            ...defaultJson.legalPages.mentions,
            draft: {
              ...defaultJson.legalPages.mentions.draft,
              publicTitle: { fr: "Draft distinct", en: "Distinct draft" },
            },
          },
        },
      };

      fs.writeFileSync(targetFile, JSON.stringify(initialData, null, 2), "utf-8");

      const applyRes = applyLegalDrafts({ targetFilePath: targetFile, apply: true });
      expect(applyRes.applied).toBe(true);

      const afterData = JSON.parse(fs.readFileSync(targetFile, "utf-8"));
      expect(afterData.business).toEqual(customBusiness);
      expect(afterData.pricing).toEqual(customPricing);
      expect(afterData.home).toEqual(customHome);
      expect(afterData.aboutPage).toEqual(customAboutPage);
      expect(afterData.contactPage).toEqual(customContactPage);
      expect(afterData.pricingPage).toEqual(customPricingPage);
      expect(afterData.legalUI).toEqual(customLegalUI);
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("leaves target file intact and cleans up temporary file if write fails", () => {
    const tempDir = path.resolve(__dirname, `../data/temp-fail-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const targetFile = path.join(tempDir, "write-failure.json");

    try {
      const initialData = {
        ...defaultJson,
        legalPages: {
          ...defaultJson.legalPages,
          mentions: {
            ...defaultJson.legalPages.mentions,
            draft: {
              ...defaultJson.legalPages.mentions.draft,
              publicTitle: { fr: "Draft avant echec", en: "Draft before failure" },
            },
          },
        },
      };
      fs.writeFileSync(targetFile, JSON.stringify(initialData, null, 2), "utf-8");

      const renameSpy = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
        throw new Error("Simulated I/O disk failure during atomic rename");
      });

      expect(() => {
        applyLegalDrafts({ targetFilePath: targetFile, apply: true });
      }).toThrow(/Simulated I\/O disk failure/);

      renameSpy.mockRestore();

      // Original target file must remain strictly identical
      const targetAfter = JSON.parse(fs.readFileSync(targetFile, "utf-8"));
      expect(targetAfter).toEqual(initialData);

      // No leftover temporary files
      const leftoverFiles = fs.readdirSync(tempDir);
      const tmpFiles = leftoverFiles.filter((f) => f.includes(".tmp."));
      expect(tmpFiles).toHaveLength(0);
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("logs explicit warning instead of failing silently when best-effort cleanup fails", () => {
    const tempDir = path.resolve(__dirname, `../data/temp-warn-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const targetFile = path.join(tempDir, "test-rotate.json");

    try {
      fs.writeFileSync(targetFile, "initial", "utf-8");
      // Create 6 dummy backup files
      for (let i = 0; i < 6; i++) {
        fs.writeFileSync(path.join(tempDir, `test-rotate.json.10000${i}-abcd.bak`), "bak", "utf-8");
      }

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const unlinkSpy = vi.spyOn(fs, "unlinkSync").mockImplementationOnce(() => {
        throw new Error("Simulated permission denied for backup removal");
      });

      rotateBackups(targetFile, 5);

      expect(warnSpy).toHaveBeenCalled();
      const warningMessage = warnSpy.mock.calls.flat().join(" ");
      expect(warningMessage).toContain("Failed to rotate old backup file");

      unlinkSpy.mockRestore();
      warnSpy.mockRestore();
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("ensures repeated application is strictly idempotent without redundant writes or backups", () => {
    const tempDir = path.resolve(__dirname, `../data/temp-idem-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const targetFile = path.join(tempDir, "idempotent.json");

    try {
      const initialData = {
        ...defaultJson,
        legalPages: {
          ...defaultJson.legalPages,
          mentions: {
            ...defaultJson.legalPages.mentions,
            draft: {
              ...defaultJson.legalPages.mentions.draft,
              publicTitle: { fr: "Draft different", en: "Different draft" },
            },
          },
        },
      };
      fs.writeFileSync(targetFile, JSON.stringify(initialData, null, 2), "utf-8");

      // First run: applies changes
      const firstRes = applyLegalDrafts({ targetFilePath: targetFile, apply: true });
      expect(firstRes.applied).toBe(true);
      expect(firstRes.backupFilePath).toBeDefined();

      const filesAfterFirst = fs.readdirSync(tempDir);
      const bakFilesCount = filesAfterFirst.filter((f) => f.endsWith(".bak")).length;
      expect(bakFilesCount).toBe(1);

      const contentAfterFirst = fs.readFileSync(targetFile, "utf-8");

      // Second run: should be completely idempotent
      const secondRes = applyLegalDrafts({ targetFilePath: targetFile, apply: true });
      expect(secondRes.alreadyUpToDate).toBe(true);
      expect(secondRes.applied).toBe(false);
      expect(secondRes.backupFilePath).toBeNull();

      // No new backup file created
      const filesAfterSecond = fs.readdirSync(tempDir);
      expect(filesAfterSecond.filter((f) => f.endsWith(".bak")).length).toBe(1);

      // Content byte-for-byte identical
      const contentAfterSecond = fs.readFileSync(targetFile, "utf-8");
      expect(contentAfterSecond).toBe(contentAfterFirst);
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("ensures dry-run mode creates neither backup nor temporary files", () => {
    const tempDir = path.resolve(__dirname, `../data/temp-dry-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const targetFile = path.join(tempDir, "dry-run.json");

    try {
      const initialData = {
        ...defaultJson,
        legalPages: {
          ...defaultJson.legalPages,
          mentions: {
            ...defaultJson.legalPages.mentions,
            draft: {
              ...defaultJson.legalPages.mentions.draft,
              publicTitle: { fr: "Draft a mettre a jour", en: "Draft to update" },
            },
          },
        },
      };
      fs.writeFileSync(targetFile, JSON.stringify(initialData, null, 2), "utf-8");

      const dryRes = applyLegalDrafts({ targetFilePath: targetFile, apply: false });
      expect(dryRes.dryRun).toBe(true);
      expect(dryRes.applied).toBe(false);
      expect(dryRes.alreadyUpToDate).toBe(false);
      expect(dryRes.backupFilePath).toBeNull();

      const allFiles = fs.readdirSync(tempDir);
      expect(allFiles).toEqual(["dry-run.json"]);
      expect(JSON.parse(fs.readFileSync(targetFile, "utf-8"))).toEqual(initialData);
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("contains no hardcoded email, phone, physical address, legal form, CBE, VAT, or co-directors in draft texts", () => {
    const pages = ["mentions", "privacy", "cgv", "cookies"] as const;
    const forbiddenPhrases = [
      "contact@sempra.be",
      "sempra.studiolm@gmail.com",
      "+32 477 86 37 42",
      "+32477863742",
      "Chaussée d'Alsemberg",
      "Alsemberg",
      "association de fait",
      "Association de fait",
      "co-directeurs",
      "co-directeur",
    ];

    for (const pageKey of pages) {
      const draft = defaultJson.legalPages[pageKey].draft;
      const draftStr = JSON.stringify(draft);

      for (const phrase of forbiddenPhrases) {
        expect(
          draftStr.toLowerCase(),
          `Page ${pageKey} draft must not contain "${phrase}"`
        ).not.toContain(phrase.toLowerCase());
      }
    }
  });

  it("contains identical section IDs and symmetric structure between FR and EN across all four drafts", () => {
    const pages = ["mentions", "privacy", "cgv", "cookies"] as const;
    for (const pageKey of pages) {
      const draft = defaultJson.legalPages[pageKey].draft;
      expect(draft.seoTitle.fr.trim().length).toBeGreaterThan(0);
      expect(draft.seoTitle.en.trim().length).toBeGreaterThan(0);
      expect(draft.publicTitle.fr.trim().length).toBeGreaterThan(0);
      expect(draft.publicTitle.en.trim().length).toBeGreaterThan(0);
      expect(draft.intro.fr.trim().length).toBeGreaterThan(0);
      expect(draft.intro.en.trim().length).toBeGreaterThan(0);

      for (const section of draft.sections) {
        expect(section.id.trim().length).toBeGreaterThan(0);
        expect(section.title.fr.trim().length).toBeGreaterThan(0);
        expect(section.title.en.trim().length).toBeGreaterThan(0);

        if (section.id !== "cookies-inventory") {
          expect(section.paragraphs.length).toBeGreaterThan(0);
        }
        for (const p of section.paragraphs) {
          expect(p.fr.trim().length).toBeGreaterThan(0);
          expect(p.en.trim().length).toBeGreaterThan(0);
        }

        if (section.listItems) {
          for (const li of section.listItems) {
            expect(li.fr.trim().length).toBeGreaterThan(0);
            expect(li.en.trim().length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("defines an accurate inventory of cookies matching real codebase session cookies and external video services", () => {
    const inventory = defaultJson.legalPages.cookies.draft.inventory;
    expect(Array.isArray(inventory)).toBe(true);
    expect(inventory.length).toBe(4);

    const ids = inventory.map((i: { id: string }) => i.id);
    expect(ids).toContain("admin-session");
    expect(ids).toContain("gallery-session");
    expect(ids).toContain("youtube");
    expect(ids).toContain("vimeo");

    const adminCookie = inventory.find((i: { id: string }) => i.id === "admin-session");
    expect(adminCookie.name.fr).toBe("__admin_session");
    expect(adminCookie.purpose.fr).toContain("Jamais déposé chez les visiteurs ordinaires");

    const galleryCookie = inventory.find((i: { id: string }) => i.id === "gallery-session");
    expect(galleryCookie.name.fr).toBe("sempra_gallery_session");

    const youtubeService = inventory.find((i: { id: string }) => i.id === "youtube");
    expect(youtubeService.name.fr).toContain("services tiers");
    expect(youtubeService.duration.fr).toContain("Durée variable définie par le fournisseur tiers");

    const vimeoService = inventory.find((i: { id: string }) => i.id === "vimeo");
    expect(vimeoService.name.fr).toContain("services tiers");
    expect(vimeoService.duration.fr).toContain("Durée variable définie par le fournisseur tiers");

    // No advertising or unsolicited analytics in inventory
    const categories = inventory.map((i: { category: string }) => i.category);
    expect(categories).not.toContain("ads");
    expect(categories).not.toContain("analytics");
  });

  it("contains no false promise of automatic deletion for emails or appointments", () => {
    const privacyStr = JSON.stringify(defaultJson.legalPages.privacy.draft);
    expect(privacyStr).not.toContain("suppression automatique des e-mails");
    expect(privacyStr).not.toContain("automatiquement supprimés après 3 ans");
    expect(privacyStr).not.toContain("automatiquement supprimés après un an");

    // Must clearly frame retention as organizational controls / administrative reviews
    expect(privacyStr).toContain("règle d'organisation interne");
    expect(privacyStr).toContain("vérification périodique");
    expect(privacyStr).toContain("contrôles périodiques de conservation");
  });

  it("contains no long dashes, dangerous HTML, or obsolete ODR platform links", () => {
    scanObjectForLongDashes(defaultJson.legalPages, "default-site-content.legalPages");
    scanObjectForDangerousHtml(defaultJson.legalPages, "default-site-content.legalPages");

    const legalStr = JSON.stringify(defaultJson.legalPages).toLowerCase();
    expect(legalStr).not.toContain("ec.europa.eu/consumers/odr");
    expect(legalStr).not.toContain("plateforme odr");
    expect(legalStr).not.toContain("odr platform");
  });

  it("respects reasonable word count boundaries (not overly long)", () => {
    const countWords = (str: string) => (str ? str.trim().split(/\s+/).filter(Boolean).length : 0);

    const getWordCounts = (doc: typeof defaultJson.legalPages.mentions.draft) => {
      let fr = countWords(doc.seoTitle.fr) + countWords(doc.seoDescription.fr) + countWords(doc.publicTitle.fr) + countWords(doc.intro.fr);
      let en = countWords(doc.seoTitle.en) + countWords(doc.seoDescription.en) + countWords(doc.publicTitle.en) + countWords(doc.intro.en);

      for (const s of doc.sections) {
        fr += countWords(s.title.fr);
        en += countWords(s.title.en);
        for (const p of s.paragraphs) {
          fr += countWords(p.fr);
          en += countWords(p.en);
        }
        for (const li of s.listItems || []) {
          fr += countWords(li.fr);
          en += countWords(li.en);
        }
      }

      for (const item of doc.inventory || []) {
        fr += countWords(item.name.fr) + countWords(item.provider.fr) + countWords(item.purpose.fr) + countWords(item.duration.fr);
        en += countWords(item.name.en) + countWords(item.provider.en) + countWords(item.purpose.en) + countWords(item.duration.en);
      }

      return { fr, en };
    };

    const mentionsWords = getWordCounts(defaultJson.legalPages.mentions.draft);
    expect(mentionsWords.fr).toBeLessThan(1000);
    expect(mentionsWords.en).toBeLessThan(1000);

    const privacyWords = getWordCounts(defaultJson.legalPages.privacy.draft);
    expect(privacyWords.fr).toBeLessThan(2000);
    expect(privacyWords.en).toBeLessThan(2000);

    const cgvWords = getWordCounts(defaultJson.legalPages.cgv.draft);
    expect(cgvWords.fr).toBeLessThan(3000);
    expect(cgvWords.en).toBeLessThan(3000);

    const cookiesWords = getWordCounts(defaultJson.legalPages.cookies.draft);
    expect(cookiesWords.fr).toBeLessThan(1200);
    expect(cookiesWords.en).toBeLessThan(1200);
  });
});
