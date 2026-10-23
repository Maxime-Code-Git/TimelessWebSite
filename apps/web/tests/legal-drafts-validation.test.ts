import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateSiteContent } from "../app/lib/site-content.server";
import { applyLegalDrafts, areDraftsEqual } from "../scripts/apply-legal-drafts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultContentPath = path.resolve(__dirname, "../app/content/default-site-content.json");
const activeContentPath = path.resolve(__dirname, "../data/site-content.json");

const LONG_DASHES = [
  String.fromCodePoint(0x2013), // en-dash
  String.fromCodePoint(0x2014), // em-dash
];

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
    expect(activeJson.business).toBeDefined();
    expect(activeJson.business.email).toBe("contact@sempra.be");
    expect(activeJson.pricing).toBeDefined();
    expect(activeJson.home).toBeDefined();
    expect(activeJson.aboutPage).toBeDefined();
    expect(activeJson.contactPage).toBeDefined();
    expect(activeJson.pricingPage).toBeDefined();
  });

  it("ensures applyLegalDrafts is strictly idempotent and safe", () => {
    // Run applyLegalDrafts on the active file in dry-run mode
    const dryRunRes = applyLegalDrafts({
      targetFilePath: activeContentPath,
      apply: false,
    });
    // Because active file was already synchronized, it is detected as alreadyUpToDate
    expect(dryRunRes.alreadyUpToDate).toBe(true);
    expect(dryRunRes.applied).toBe(false);

    // Run applyLegalDrafts with apply: true
    const applyRes = applyLegalDrafts({
      targetFilePath: activeContentPath,
      apply: true,
    });
    // Second application must be a no-op
    expect(applyRes.alreadyUpToDate).toBe(true);
    expect(applyRes.applied).toBe(false);
    expect(applyRes.backupFilePath).toBeNull();
  });

  it("proves applyLegalDrafts creates backup, replaces only drafts, and preserves published/history on mock data", () => {
    const tempDir = path.resolve(__dirname, `../data/temp-test-${crypto.randomBytes(4).toString("hex")}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const mockFile = path.join(tempDir, "mock-site-content.json");

    try {
      const existingHistoryItem = {
        version: 1,
        effectiveDate: "2025-01-01",
        lastModified: "2025-01-01T00:00:00.000Z",
        seoTitle: { fr: "Archived FR", en: "Archived EN" },
        seoDescription: { fr: "Archived desc FR", en: "Archived desc EN" },
        publicTitle: { fr: "Archived title FR", en: "Archived title EN" },
        intro: { fr: "Archived intro FR", en: "Archived intro EN" },
        sections: [],
      };

      const mockData = {
        ...defaultJson,
        revision: "mock-initial-rev",
        updatedAt: "2025-01-01T00:00:00.000Z",
        business: {
          ...defaultJson.business,
          email: "custom-preserve@sempra.be",
        },
        legalPages: {
          ...defaultJson.legalPages,
          mentions: {
            draft: { ...defaultJson.legalPages.mentions.draft, publicTitle: { fr: "Old draft", en: "Old draft" } },
            published: existingHistoryItem,
            history: [existingHistoryItem],
          },
        },
      };

      fs.writeFileSync(mockFile, JSON.stringify(mockData, null, 2), "utf-8");

      // Test Dry Run
      const dryRes = applyLegalDrafts({
        targetFilePath: mockFile,
        apply: false,
      });
      expect(dryRes.dryRun).toBe(true);
      expect(dryRes.applied).toBe(false);
      expect(dryRes.alreadyUpToDate).toBe(false);

      // Verify file was NOT modified in dry-run
      const afterDry = JSON.parse(fs.readFileSync(mockFile, "utf-8"));
      expect(afterDry.revision).toBe("mock-initial-rev");

      // Test Apply
      const applyRes = applyLegalDrafts({
        targetFilePath: mockFile,
        apply: true,
      });
      expect(applyRes.applied).toBe(true);
      expect(applyRes.backupFilePath).toBeDefined();
      expect(fs.existsSync(applyRes.backupFilePath!)).toBe(true);

      const afterApply = JSON.parse(fs.readFileSync(mockFile, "utf-8"));
      // Revision and updatedAt updated
      expect(afterApply.revision).not.toBe("mock-initial-rev");
      expect(afterApply.updatedAt).not.toBe("2025-01-01T00:00:00.000Z");

      // Business preserved
      expect(afterApply.business.email).toBe("custom-preserve@sempra.be");

      // Published and history preserved
      expect(afterApply.legalPages.mentions.published).toEqual(existingHistoryItem);
      expect(afterApply.legalPages.mentions.history).toEqual([existingHistoryItem]);

      // Draft updated to blueprint
      expect(afterApply.legalPages.mentions.draft.publicTitle.fr).toBe("Mentions légales");

      // Second apply is idempotent
      const secondApply = applyLegalDrafts({
        targetFilePath: mockFile,
        apply: true,
      });
      expect(secondApply.alreadyUpToDate).toBe(true);
      expect(secondApply.applied).toBe(false);
    } finally {
      // Clean up temp dir
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
