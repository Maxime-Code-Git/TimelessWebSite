import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { validateSiteContent } from "../app/lib/site-content.server";

const defaultContentPath = path.resolve(__dirname, "../app/content/default-site-content.json");

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

  it("passes strict schema validation through validateSiteContent", () => {
    const validated = validateSiteContent(defaultJson);
    expect(validated.schemaVersion).toBe(11);
    expect(validated.legalPages).toBeDefined();
  });

  it("contains all four legal pages in bilingual FR and EN draft state", () => {
    const pages = ["mentions", "privacy", "cgv", "cookies"] as const;
    for (const pageKey of pages) {
      const page = defaultJson.legalPages[pageKey];
      expect(page, `Page ${pageKey} should exist`).toBeDefined();
      expect(page.draft, `Page ${pageKey} draft should exist`).toBeDefined();

      const draft = page.draft;
      expect(draft.seoTitle.fr.trim().length).toBeGreaterThan(0);
      expect(draft.seoTitle.en.trim().length).toBeGreaterThan(0);
      expect(draft.publicTitle.fr.trim().length).toBeGreaterThan(0);
      expect(draft.publicTitle.en.trim().length).toBeGreaterThan(0);
      expect(draft.intro.fr.trim().length).toBeGreaterThan(0);
      expect(draft.intro.en.trim().length).toBeGreaterThan(0);
      expect(draft.sections.length).toBeGreaterThan(0);

      for (const section of draft.sections) {
        expect(section.id.trim().length).toBeGreaterThan(0);
        expect(section.title.fr.trim().length).toBeGreaterThan(0);
        expect(section.title.en.trim().length).toBeGreaterThan(0);
        for (const p of section.paragraphs) {
          expect(p.fr.trim().length).toBeGreaterThan(0);
          expect(p.en.trim().length).toBeGreaterThan(0);
        }
        for (const li of section.listItems || []) {
          expect(li.fr.trim().length).toBeGreaterThan(0);
          expect(li.en.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("strictly preserves separation between draft and published (no automatic publishing)", () => {
    const pages = ["mentions", "privacy", "cgv", "cookies"] as const;
    for (const pageKey of pages) {
      const page = defaultJson.legalPages[pageKey];
      expect(page.published).toBeNull();
      expect(page.draft.effectiveDate).toBeNull();
      expect(Array.isArray(page.history)).toBe(true);
    }
  });

  it("does not contain obsolete EU ODR platform links or references", () => {
    const contentStr = JSON.stringify(defaultJson.legalPages).toLowerCase();
    expect(contentStr).not.toContain("ec.europa.eu/consumers/odr");
    expect(contentStr).not.toContain("plateforme odr");
    expect(contentStr).not.toContain("odr platform");
  });

  it("does not falsely claim that no cookies are used", () => {
    const cookiesPageStr = JSON.stringify(defaultJson.legalPages.cookies).toLowerCase();
    expect(cookiesPageStr).not.toContain("aucun cookie n'est utilisé");
    expect(cookiesPageStr).not.toContain("n'utilise aucun cookie");
    expect(cookiesPageStr).not.toContain("no cookies are used");
  });

  it("defines an accurate inventory of strictly necessary cookies and conditional video players", () => {
    const inventory = defaultJson.legalPages.cookies.draft.inventory;
    expect(Array.isArray(inventory)).toBe(true);
    expect(inventory.length).toBe(4);

    const ids = inventory.map((i: { id: string }) => i.id);
    expect(ids).toContain("admin-session");
    expect(ids).toContain("gallery-session");
    expect(ids).toContain("youtube");
    expect(ids).toContain("vimeo");

    // No advertising or unsolicited analytics in inventory
    const categories = inventory.map((i: { category: string }) => i.category);
    expect(categories).not.toContain("ads");
    expect(categories).not.toContain("analytics");
  });

  it("contains the standard placeholder for unverified business information", () => {
    const mentionsStr = JSON.stringify(defaultJson.legalPages.mentions);
    expect(mentionsStr).toContain("À compléter avant publication");
    expect(mentionsStr).toContain("To be completed before publication");
  });

  it("contains zero en-dashes or em-dashes in legal pages", () => {
    scanObjectForLongDashes(defaultJson.legalPages, "default-site-content.legalPages");
  });

  it("contains no dangerous HTML tags or script injection vectors", () => {
    scanObjectForDangerousHtml(defaultJson.legalPages, "default-site-content.legalPages");
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
