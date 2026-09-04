import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Mock env-loader to prevent .env.local from loading
vi.mock("../../../../scripts/env-loader.js", () => ({}));

// Mock env.server entirely to prevent top-level execution errors
vi.mock("../app/lib/env.server", () => {
  return {
    ENV: {
      get PORTFOLIO_CONTENT_PATH() { return process.env.PORTFOLIO_CONTENT_PATH; },
      get PORTFOLIO_MEDIA_PATH() { return process.env.PORTFOLIO_MEDIA_PATH; },
    },
    requireEnvVar: (_n: string) => "mocked",
  };
});

import {
  getPortfolioContent,
  getWatermarkConfig,
  updateWatermarkText,
  validateWatermarkText,
} from "../app/lib/portfolio-content.server";
import { RevisionConflictError, CorruptedContentError, ValidationError } from "../app/lib/site-content.server";

describe("Watermark Configuration (Phase 3C.2A)", () => {
  let tempDir: string;
  let portfolioPath: string;
  let mediaPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-watermark-test-"));
    portfolioPath = path.join(tempDir, "portfolio.json");
    mediaPath = path.join(tempDir, "media");
    fs.mkdirSync(mediaPath);
    process.env.PORTFOLIO_CONTENT_PATH = portfolioPath;
    process.env.PORTFOLIO_MEDIA_PATH = mediaPath;
    process.env.NODE_ENV = "test";
    process.env.SMTP_HOST = "localhost";
    process.env.SMTP_PORT = "2525";
    process.env.SMTP_USER = "test";
    process.env.SMTP_PASS = "test";
    process.env.SMTP_FROM = "test@example.com";
    process.env.SMTP_TO = "test@example.com";
    process.env.ADMIN_PASSWORD_HASH = "fake";
    process.env.ADMIN_SESSION_SECRET = "fakefakefakefakefakefakefakefake";
    process.env.CONTACT_RATE_LIMIT_SECRET = "fake";
    process.env.CONTACT_RATE_LIMIT_MAX = "10";
    process.env.RATE_LIMIT_DB_PATH = path.join(tempDir, "rate-limit.db");
    process.env.SITE_CONTENT_PATH = path.join(tempDir, "site-content.json");
    process.env.PUBLIC_SITE_URL = "http://localhost:3000";
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should read old 3C.1 JSON without watermark and provide default config", () => {
    const oldJson = {
      schemaVersion: 1,
      revision: "aaaa0000bbbb1111cccc2222dddd3333",
      updatedAt: "2026-01-01T00:00:00.000Z",
      projects: [],
    };
    fs.writeFileSync(portfolioPath, JSON.stringify(oldJson));

    const portfolio = getPortfolioContent();
    expect(portfolio.watermark).toBeDefined();
    expect(portfolio.watermark.mode).toBe("text");
    expect(portfolio.watermark.text).toBe("Sempra");
    expect(portfolio.watermark.revision).toBe("00000000000000000000000000000000");
    expect(portfolio.watermark.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("should not rewrite the file on read of old 3C.1 JSON", () => {
    const oldJson = {
      schemaVersion: 1,
      revision: "aaaa0000bbbb1111cccc2222dddd3333",
      updatedAt: "2026-01-01T00:00:00.000Z",
      projects: [],
    };
    fs.writeFileSync(portfolioPath, JSON.stringify(oldJson, null, 2));
    const contentBefore = fs.readFileSync(portfolioPath, "utf-8");

    getPortfolioContent();

    const contentAfter = fs.readFileSync(portfolioPath, "utf-8");
    expect(contentAfter).toBe(contentBefore);
  });

  it("should return default Sempra watermark text", () => {
    const config = getWatermarkConfig();
    expect(config.text).toBe("Sempra");
    expect(config.mode).toBe("text");
  });

  it("should successfully update watermark text", () => {
    // Create initial portfolio
    const initial = {
      schemaVersion: 1,
      revision: "aaaa0000bbbb1111cccc2222dddd3333",
      updatedAt: "2026-01-01T00:00:00.000Z",
      projects: [],
    };
    fs.writeFileSync(portfolioPath, JSON.stringify(initial));

    const { portfolioRevision, watermarkRevision } = updateWatermarkText("Mon Studio", "aaaa0000bbbb1111cccc2222dddd3333");
    expect(portfolioRevision).toMatch(/^[0-9a-f]{32}$/);
    expect(watermarkRevision).toMatch(/^[0-9a-f]{32}$/);

    const updated = getPortfolioContent();
    expect(updated.watermark.text).toBe("Mon Studio");
    expect(updated.watermark.revision).toBe(watermarkRevision);
    expect(updated.revision).toBe(portfolioRevision);
  });

  it("should store raw text with ampersand and redisplay it unescaped", () => {
    const initial = {
      schemaVersion: 1,
      revision: "aaaa0000bbbb1111cccc2222dddd3333",
      updatedAt: "2026-01-01T00:00:00.000Z",
      projects: [],
    };
    fs.writeFileSync(portfolioPath, JSON.stringify(initial));

    updateWatermarkText("Sempra & Co", "aaaa0000bbbb1111cccc2222dddd3333");

    const rawJson = JSON.parse(fs.readFileSync(portfolioPath, "utf-8"));
    expect(rawJson.watermark.text).toBe("Sempra & Co");

    const portfolio = getPortfolioContent();
    expect(portfolio.watermark.text).toBe("Sempra & Co");
  });

  it("should trim text and store the cleaned version", () => {
    const initial = {
      schemaVersion: 1,
      revision: "aaaa0000bbbb1111cccc2222dddd3333",
      updatedAt: "2026-01-01T00:00:00.000Z",
      projects: [],
    };
    fs.writeFileSync(portfolioPath, JSON.stringify(initial));

    updateWatermarkText("   Mon Studio   ", "aaaa0000bbbb1111cccc2222dddd3333");

    const rawJson = JSON.parse(fs.readFileSync(portfolioPath, "utf-8"));
    expect(rawJson.watermark.text).toBe("Mon Studio");
  });

  it("should apply 40 character limit after trimming", () => {
    // 40 chars of text, plus spaces around it
    const text = "   " + "a".repeat(40) + "   ";
    expect(validateWatermarkText(text)).toBe("a".repeat(40));

    // 41 chars of text should throw
    expect(() => validateWatermarkText("a".repeat(41))).toThrow(ValidationError);
  });

  it("should reject unknown properties due to strict schema", () => {
    const initial = {
      schemaVersion: 1,
      revision: "aaaa0000bbbb1111cccc2222dddd3333",
      updatedAt: "2026-01-01T00:00:00.000Z",
      projects: [],
      unknownProperty: "should fail",
    };
    fs.writeFileSync(portfolioPath, JSON.stringify(initial));

    expect(() => getPortfolioContent()).toThrow(CorruptedContentError);
  });

  it("should preserve other mutations during update", () => {
    const initial = {
      schemaVersion: 1,
      revision: "aaaa0000bbbb1111cccc2222dddd3333",
      updatedAt: "2026-01-01T00:00:00.000Z",
      projects: [
        {
          id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          slug: { fr: "test-fr", en: "test-en" },
          title: { fr: "Test", en: "Test" },
          description: { fr: "Test", en: "Test" },
          location: null,
          date: null,
          status: "draft",
          order: 0,
          coverPhotoId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          photos: [],
        }
      ],
    };
    fs.writeFileSync(portfolioPath, JSON.stringify(initial));

    updateWatermarkText("Updated", "aaaa0000bbbb1111cccc2222dddd3333");

    const updated = getPortfolioContent();
    expect(updated.projects.length).toBe(1);
    expect(updated.projects[0].id).toBe("3fa85f64-5717-4562-b3fc-2c963f66afa6");

  });

  it("should throw RevisionConflictError on stale revision", () => {
    const initial = {
      schemaVersion: 1,
      revision: "aaaa0000bbbb1111cccc2222dddd3333",
      updatedAt: "2026-01-01T00:00:00.000Z",
      projects: [],
    };
    fs.writeFileSync(portfolioPath, JSON.stringify(initial));

    expect(() => updateWatermarkText("Test", "00000000000000000000000000000000"))
      .toThrow(RevisionConflictError);
  });

  it("should throw CorruptedContentError on corrupted JSON", () => {
    fs.writeFileSync(portfolioPath, "{ broken json");

    expect(() => updateWatermarkText("Test", "anything"))
      .toThrow(CorruptedContentError);
  });

  it("should not modify corrupted file after failed update", () => {
    fs.writeFileSync(portfolioPath, "{ broken json");
    const before = fs.readFileSync(portfolioPath, "utf-8");

    try {
      updateWatermarkText("Test", "anything");
    } catch {
      // expected
    }

    expect(fs.readFileSync(portfolioPath, "utf-8")).toBe(before);
  });

  it("should reject empty text", () => {
    expect(() => validateWatermarkText("")).toThrow(ValidationError);
  });

  it("should reject whitespace-only text", () => {
    expect(() => validateWatermarkText("   ")).toThrow(ValidationError);
  });

  it("should reject text longer than 40 characters", () => {
    expect(() => validateWatermarkText("a".repeat(41))).toThrow(ValidationError);
  });

  it("should reject HTML tags", () => {
    expect(() => validateWatermarkText("<script>alert(1)</script>")).toThrow(ValidationError);
    expect(() => validateWatermarkText("<b>bold</b>")).toThrow(ValidationError);
    expect(() => validateWatermarkText("test<!DOCTYPE>")).toThrow(ValidationError);
  });

  it("should reject control characters", () => {
    expect(() => validateWatermarkText("test\x00")).toThrow(ValidationError);
    expect(() => validateWatermarkText("test\x1f")).toThrow(ValidationError);
    expect(() => validateWatermarkText("test\x7f")).toThrow(ValidationError);
  });

  it("should accept valid special characters (ampersand, quotes)", () => {
    expect(validateWatermarkText("Sempra & Co")).toBe("Sempra & Co");
    expect(validateWatermarkText("L'Atelier")).toBe("L'Atelier");
    expect(validateWatermarkText('Studio "Prestige"')).toBe('Studio "Prestige"');
  });

  it("should leave no temp or backup files after failed validation", () => {
    const initial = {
      schemaVersion: 1,
      revision: "aaaa0000bbbb1111cccc2222dddd3333",
      updatedAt: "2026-01-01T00:00:00.000Z",
      projects: [],
    };
    fs.writeFileSync(portfolioPath, JSON.stringify(initial));

    const filesBefore = fs.readdirSync(tempDir).sort();

    try {
      updateWatermarkText("", "aaaa0000bbbb1111cccc2222dddd3333");
    } catch {
      // expected
    }

    const filesAfter = fs.readdirSync(tempDir).sort();
    expect(filesAfter).toEqual(filesBefore);
  });

  it("should update both watermark.revision and global revision on success", () => {
    const initial = {
      schemaVersion: 1,
      revision: "aaaa0000bbbb1111cccc2222dddd3333",
      updatedAt: "2026-01-01T00:00:00.000Z",
      projects: [],
    };
    fs.writeFileSync(portfolioPath, JSON.stringify(initial));

    const { portfolioRevision, watermarkRevision } = updateWatermarkText("NewMark", "aaaa0000bbbb1111cccc2222dddd3333");

    const updated = getPortfolioContent();
    expect(updated.revision).toBe(portfolioRevision);
    expect(updated.watermark.revision).toBe(watermarkRevision);
    expect(updated.revision).not.toBe("aaaa0000bbbb1111cccc2222dddd3333");
    expect(updated.watermark.revision).not.toBe("00000000000000000000000000000000");
    expect(updated.watermark.revision).not.toBe(updated.revision);
  });

  it("should persist watermark config during next successful mutation on old JSON", () => {
    // Start with old 3C.1 JSON without watermark
    const oldJson = {
      schemaVersion: 1,
      revision: "aaaa0000bbbb1111cccc2222dddd3333",
      updatedAt: "2026-01-01T00:00:00.000Z",
      projects: [],
    };
    fs.writeFileSync(portfolioPath, JSON.stringify(oldJson));

    // Mutate via watermark update
    updateWatermarkText("Studio X", "aaaa0000bbbb1111cccc2222dddd3333");

    // Now the file should contain watermark property
    const rawJson = JSON.parse(fs.readFileSync(portfolioPath, "utf-8"));
    expect(rawJson.watermark).toBeDefined();
    expect(rawJson.watermark.text).toBe("Studio X");
    expect(rawJson.watermark.mode).toBe("text");
  });
});
