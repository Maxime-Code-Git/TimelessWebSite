import { describe, it, expect } from "vitest";
import { validateSiteContent } from "../app/lib/site-content.server";
import defaultContent from "../app/content/default-site-content.json";

describe("home-content.server.test.ts", () => {
  it("validates UUIDs properly", () => {
    const data = JSON.parse(JSON.stringify(defaultContent));
    data.schemaVersion = 2;
    data.home.studio.imageId = "invalid-uuid";
    expect(() => validateSiteContent(data)).toThrow();
  });

  it("enforces strict validations and alt FR/EN", () => {
    const data = JSON.parse(JSON.stringify(defaultContent));
    data.schemaVersion = 2;
    data.home.studio.alt = { fr: "Test" };
    expect(() => validateSiteContent(data)).toThrow();
  });

  it("checks existing variants", () => {
    const data = JSON.parse(JSON.stringify(defaultContent));
    data.schemaVersion = 2;
    data.home.studio.variants = [{ name: "wrong", width: 100, height: 100 }];
    expect(() => validateSiteContent(data)).toThrow();
  });

  it("migration V1 without write", () => {
    const v1Data = {
      schemaVersion: 1,
      revision: "12345678901234567890123456789012",
      updatedAt: "2023-01-01T00:00:00.000Z",
      business: defaultContent.business,
      pricing: defaultContent.pricing
    };
    const migrated = validateSiteContent(v1Data);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.revision).toBe(v1Data.revision);
    expect(migrated.home).toBeDefined();
    expect(migrated.updatedAt).toBe(v1Data.updatedAt);
  });
});
