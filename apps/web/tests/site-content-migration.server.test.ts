import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getRawSiteContent, validateSiteContent } from "../app/lib/site-content.server";
import defaultContent from "../app/content/default-site-content.json";

const INTERMEDIATE_V2 = {
  "schemaVersion": 2,
  "revision": "abcdef1234567890abcdef1234567890",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "business": {
    "email": "test@test.com",
    "phoneDisplay": "+32 477 86 37 42",
    "phoneE164": "+32477863742",
    "address": null,
    "enterpriseNumber": null,
    "legalForm": null,
    "legalRepresentative": null,
    "hostingProvider": null,
    "hostingAddress": null,
    "depositPercent": null,
    "instagramUrl": null,
    "linkedinUrl": null,
    "serviceArea": {
      "fr": "Belgique",
      "en": "Belgium"
    }
  },
  "pricing": {
    "photo": [
      { "id": "essential", "priceCents": 129000, "featured": false },
      { "id": "signature", "priceCents": 179000, "featured": true },
      { "id": "prestige", "priceCents": 239000, "featured": false }
    ],
    "film": [
      { "id": "essential", "priceCents": 149000, "featured": false },
      { "id": "signature", "priceCents": 219000, "featured": true },
      { "id": "prestige", "priceCents": 299000, "featured": false }
    ],
    "duo": [
      { "id": "essential", "priceCents": 249000, "featured": false },
      { "id": "signature", "priceCents": 349000, "featured": true },
      { "id": "prestige", "priceCents": 469000, "featured": false }
    ]
  },
  "home": {
    "hero": {
      "smallTitle": { "fr": "Test", "en": "Test" },
      "largeTitle": { "fr": "Test", "en": "Test" },
      "subtitle": { "fr": "Test", "en": "Test" },
      "images": [
        { "imageId": null, "alt": { "fr": "Image", "en": "Image" }, "width": 960, "height": 1440 },
        { "imageId": null, "alt": { "fr": "Image", "en": "Image" }, "width": 960, "height": 1440 },
        { "imageId": null, "alt": { "fr": "Image", "en": "Image" }, "width": 960, "height": 1440 }
      ]
    },
    "editorial": {
      "paragraph": { "fr": "Test", "en": "Test" },
      "highlight": { "fr": "Test", "en": "Test" }
    },
    "portfolioCards": {
      "photo": {
        "imageId": null,
        "title": { "fr": "Photographie", "en": "Photography" },
        "subtitle": { "fr": "Lumière naturelle & moments volés", "en": "Natural light & candid moments" }
      },
      "video": {
        "imageId": null,
        "title": { "fr": "Film de mariage", "en": "Wedding Film" },
        "subtitle": { "fr": "Émotions en mouvement", "en": "Emotions in motion" }
      }
    },
    "pricingPreview": {
      "sectionTitle": { "fr": "Test", "en": "Test" },
      "essentialDescription": { "fr": "Test", "en": "Test" },
      "signatureDescription": { "fr": "Test", "en": "Test" },
      "prestigeDescription": { "fr": "Test", "en": "Test" },
      "promoText": { "fr": "Test", "en": "Test" },
      "promoTextBold": { "fr": "Test", "en": "Test" },
      "caveat": { "fr": "Test", "en": "Test" },
      "buttonText": { "fr": "Test", "en": "Test" },
      "customFormulaText": { "fr": "Test", "en": "Test" },
      "customFormulaTextEm": { "fr": "Test", "en": "Test" }
    },
    "studio": {
      "imageId": null,
      "title": { "fr": "Sempra", "en": "Sempra" },
      "description": { "fr": "L & M", "en": "L & M" }
    }
  }
};

const V1_CONTENT = {
  "schemaVersion": 1,
  "revision": "abcdef1234567890abcdef1234567890",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "business": INTERMEDIATE_V2.business,
  "pricing": {
    "photo": [
      { "id": "essential", "priceCents": 99999, "featured": true },
      { "id": "signature", "priceCents": 199999, "featured": false },
      { "id": "prestige", "priceCents": 299999, "featured": false }
    ],
    "film": [
      { "id": "essential", "priceCents": 100000, "featured": false },
      { "id": "signature", "priceCents": 200000, "featured": false },
      { "id": "prestige", "priceCents": 300000, "featured": false }
    ],
    "duo": [
      { "id": "essential", "priceCents": 150000, "featured": false },
      { "id": "signature", "priceCents": 250000, "featured": false },
      { "id": "prestige", "priceCents": 350000, "featured": false }
    ]
  }
};

describe("Migration of intermediate V2 content", () => {
  let tempDir: string;
  let filePath: string;
  const originalEnv = process.env.SITE_CONTENT_PATH;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "site-content-migration-test-"));
    filePath = path.join(tempDir, "site-content.json");
    process.env.SITE_CONTENT_PATH = filePath;
  });

  afterEach(() => {
    process.env.SITE_CONTENT_PATH = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("migrates V2 successfully and uses specific fallback instead of generic description", () => {
    fs.writeFileSync(filePath, JSON.stringify(INTERMEDIATE_V2), "utf8");

    const { content } = getRawSiteContent();

    // Photo custom descriptions should be preserved
    expect(content.pricing.photo[0].summary.fr).toBe("Test"); // from home.pricingPreview
    expect(content.pricing.photo[0].name.fr).toBe("Essentiel");

    // Check real values for film and duo
    expect(content.pricing.film[0].summary.fr).not.toBe("Description");
    expect(content.pricing.film[0].summary.fr).not.toBe("Test");
    expect(content.pricing.duo[0].summary.fr).not.toBe("Description");
    expect(content.pricing.duo[0].summary.fr).not.toBe("Test");

    // Verify all 9 formulas do not have generic texts
    const categories = ["photo", "film", "duo"] as const;
    for (const cat of categories) {
      for (const formula of content.pricing[cat]) {
        expect(formula.summary.fr).not.toBe("Description");
        expect(formula.summary.en).not.toBe("Description");
        expect(formula.description.fr).not.toBe("Description");
        expect(formula.description.en).not.toBe("Description");
      }
    }

    expect(content.pricing.photo[0].description.fr).toBe("Une présence discrète pour capturer l'essentiel de votre mariage. Idéal pour les mariages intimes.");
    expect(content.pricing.photo[0].priceCents).toBe(129000);
    expect(content.pricing.photo[0].featured).toBe(false);
  });

  it("migrates V1 successfully, uses real fallbacks and preserves prices/featured", () => {
    fs.writeFileSync(filePath, JSON.stringify(V1_CONTENT), "utf8");
    const { content } = getRawSiteContent();

    // Check that it's migrated to V3
    expect(content.schemaVersion).toBe(4);

    // Check real fallbacks instead of generic "Description"
    const photoEssential = content.pricing.photo.find(f => f.id === "essential");
    expect(photoEssential?.summary.fr).toBe("Les moments clés, en images.");
    expect(photoEssential?.name.fr).toBe("Essentiel");
    expect(photoEssential?.description.fr).not.toBe("Description");

    // Check price and featured preserved
    expect(photoEssential?.priceCents).toBe(99999);
    expect(photoEssential?.featured).toBe(true); // preserved from V1_CONTENT

    // Check deterministic IDs
    expect(photoEssential?.includedItems[0].id).toBe("photo-essential-0");
  });

  it("migration V1 idempotency", () => {
    fs.writeFileSync(filePath, JSON.stringify(V1_CONTENT), "utf8");
    const { content: c1 } = getRawSiteContent();
    const { content: c2 } = getRawSiteContent();
    expect(c1.pricing).toEqual(c2.pricing);
  });

  it("migration V2 idempotency", () => {
    fs.writeFileSync(filePath, JSON.stringify(INTERMEDIATE_V2), "utf8");
    const { content: c1 } = getRawSiteContent();
    const { content: c2 } = getRawSiteContent();
    expect(c1.pricing).toEqual(c2.pricing);
  });

  it("objet d’entrée totalement inchangé après migration V1", () => {
    const input = JSON.parse(JSON.stringify(V1_CONTENT));
    const before = JSON.stringify(input);
    validateSiteContent(input);
    const after = JSON.stringify(input);
    expect(before).toBe(after);
  });

  it("objet d’entrée totalement inchangé après migration V2", () => {
    const input = JSON.parse(JSON.stringify(INTERMEDIATE_V2));
    const before = JSON.stringify(input);
    validateSiteContent(input);
    const after = JSON.stringify(input);
    expect(before).toBe(after);
  });

  it("modifying migrated result does not affect subsequent migrations", () => {
    fs.writeFileSync(filePath, JSON.stringify(V1_CONTENT), "utf8");
    const { content: c1 } = getRawSiteContent();
    c1.pricing.photo[0].name.fr = "Mutated";

    const { content: c2 } = getRawSiteContent();
    expect(c2.pricing.photo[0].name.fr).toBe("Essentiel");
  });

  it("detects actual invalid JSON as corrupted", () => {
    fs.writeFileSync(filePath, "{ invalid json", "utf8");
    const { isCorrupted } = getRawSiteContent();
    expect(isCorrupted).toBe(true);
  });

  it("detects valid JSON but with unrecoverable corruption as corrupted", () => {
    const corruptData = JSON.parse(JSON.stringify(INTERMEDIATE_V2));
    delete corruptData.home.hero;
    fs.writeFileSync(filePath, JSON.stringify(corruptData), "utf8");

    const { isCorrupted } = getRawSiteContent();
    expect(isCorrupted).toBe(true);
  });

  describe("Migration V3 to V4 (FAQ Admin)", () => {
    it("adds pricingPage with defaults and preserves all old data", () => {
      const v3Data = JSON.parse(JSON.stringify(defaultContent));
      v3Data.schemaVersion = 3;
      delete v3Data.pricingPage;
      v3Data.business.email = "v3@test.com";

      const originalJson = JSON.stringify(v3Data);

      const migrated = validateSiteContent(v3Data);
      expect(migrated.schemaVersion).toBe(4);
      expect(migrated.business.email).toBe("v3@test.com");
      expect(migrated.pricingPage).toBeDefined();
      expect(migrated.pricingPage.faqs).toHaveLength(defaultContent.pricingPage.faqs.length);

      // No mutation
      expect(JSON.stringify(v3Data)).toBe(originalJson);

      // No shared references
      migrated.pricingPage.faqs[0].id = "mutated";
      expect(defaultContent.pricingPage.faqs[0].id).not.toBe("mutated");
    });

    it("is idempotent for V4", () => {
      const v4Data = JSON.parse(JSON.stringify(defaultContent));
      const migrated1 = validateSiteContent(v4Data);
      const migrated2 = validateSiteContent(migrated1);
      expect(migrated1).toEqual(migrated2);
    });
  });
});
