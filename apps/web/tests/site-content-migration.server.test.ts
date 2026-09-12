import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getRawSiteContent } from "../app/lib/site-content.server";

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

  it("migrates successfully and preserves original file state on read", () => {
    fs.writeFileSync(filePath, JSON.stringify(INTERMEDIATE_V2), "utf8");
    const mtime = fs.statSync(filePath).mtimeMs;

    // Must load without corruption
    const { content, isCorrupted } = getRawSiteContent();
    expect(isCorrupted).toBe(false);
    expect(content.schemaVersion).toBe(2);

    // Check if new keys exist
    expect(content.home.pricingPreview.photoEssentialDescription).toBeDefined();

    // Check if original data was preserved
    expect(content.business.email).toBe("test@test.com");
    expect(content.pricing.photo[0].priceCents).toBe(129000);

    // Check that reading did not alter the file on disk
    const mtimeAfter = fs.statSync(filePath).mtimeMs;
    expect(mtimeAfter).toBe(mtime);

    const fileContent = JSON.parse(fs.readFileSync(filePath, "utf8"));
    expect(fileContent.home.pricingPreview.essentialDescription).toBeDefined();
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
});
