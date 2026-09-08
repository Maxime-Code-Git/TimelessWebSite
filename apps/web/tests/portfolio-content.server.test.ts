import crypto from "node:crypto";





import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  getRawPortfolioContent,
  getPortfolioContent,
  createDefaultPortfolioV2,
  migrateLegacyPortfolio,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  addPhotoToPortfolio,
  updatePhotoMetadata,
  setPhotoVisibility,
  trashPhoto,
} from "../app/lib/portfolio-content.server";

import { vi } from "vitest";

vi.mock("../app/lib/env.server", () => ({
  ENV: {
    get PORTFOLIO_CONTENT_PATH() { return process.env.PORTFOLIO_CONTENT_PATH || ""; },
    get PORTFOLIO_MEDIA_PATH() { return process.env.PORTFOLIO_MEDIA_PATH || ""; },
  }
}));

describe("portfolio-content.server V2", () => {
  let tempDir: string;
  let portfolioPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-v2-test-"));
    portfolioPath = path.join(tempDir, "portfolio.json");
    process.env.PORTFOLIO_CONTENT_PATH = portfolioPath;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.PORTFOLIO_CONTENT_PATH;
  });

  it("returns empty valid portfolio if file absent", () => {
    const raw = getRawPortfolioContent();
    expect(raw.isCorrupted).toBe(false);
    expect(raw.isLegacy).toBe(false);
    expect(raw.content.schemaVersion).toBe(2);
    expect(raw.content.categories).toEqual([]);
    expect(raw.content.photos).toEqual([]);
  });

  it("reads valid JSON v2", () => {
    const defaultV2 = createDefaultPortfolioV2();
    fs.writeFileSync(portfolioPath, JSON.stringify(defaultV2));
    const raw = getRawPortfolioContent();
    expect(raw.isCorrupted).toBe(false);
    expect(raw.isLegacy).toBe(false);
    expect(raw.content.schemaVersion).toBe(2);
  });

  it("getRawPortfolioContent returns empty v2 without modifying if v1 detected", () => {
    fs.writeFileSync(portfolioPath, JSON.stringify({ schemaVersion: 1, revision: "rev1", projects: [] }));
    const raw = getRawPortfolioContent();
    expect(raw.isCorrupted).toBe(false);
    expect(raw.isLegacy).toBe(true);
    expect(raw.content.schemaVersion).toBe(2);
    // File shouldn't have changed
    expect(JSON.parse(fs.readFileSync(portfolioPath, "utf-8")).schemaVersion).toBe(1);
  });

  it("migrateLegacyPortfolio creates legacy file, verifies, and atomically replaces with v2", () => {
    const v1Content = Buffer.from(JSON.stringify({ schemaVersion: 1, revision: "abc123def456abc123def456abc123de", updatedAt: "2024-01-01T00:00:00.000Z", projects: [] }), "utf-8");
    fs.writeFileSync(portfolioPath, v1Content);
    migrateLegacyPortfolio("abc123def456abc123def456abc123de");

    const raw = getRawPortfolioContent();
    expect(raw.isLegacy).toBe(false);
    expect(raw.content.schemaVersion).toBe(2);

    // Exact verification
    const expectedHash = crypto.createHash("sha256").update(v1Content).digest("hex");
    const expectedArchiveName = `portfolio.legacy.${expectedHash}.json`;
    const expectedArchivePath = path.resolve(path.dirname(portfolioPath), expectedArchiveName);

    const dirFiles = fs.readdirSync(path.dirname(portfolioPath)).filter(f => f.startsWith("portfolio.legacy."));
    expect(dirFiles).toHaveLength(1);
    expect(dirFiles[0]).toBe(expectedArchiveName);

    const archiveBytes = fs.readFileSync(expectedArchivePath);
    expect(archiveBytes.equals(v1Content)).toBe(true);

    if (process.platform !== "win32") {
      const stat = fs.statSync(expectedArchivePath);
      expect((stat.mode & 0o777)).toBe(0o600);
    }

    // Call it again to verify idempotency
    const mtimeBefore = fs.statSync(expectedArchivePath).mtimeMs;
    migrateLegacyPortfolio(raw.content.revision);

    const dirFilesAfter = fs.readdirSync(path.dirname(portfolioPath)).filter(f => f.startsWith("portfolio.legacy."));
    expect(dirFilesAfter).toHaveLength(1);
    expect(fs.statSync(expectedArchivePath).mtimeMs).toBe(mtimeBefore);
  });

  it("migrateLegacyPortfolio rejects migration if pre-existing archive is invalid (wrong bytes)", () => {
    const v1Content = Buffer.from(JSON.stringify({ schemaVersion: 1, revision: "abc123def456abc123def456abc123de", updatedAt: "2024-01-01T00:00:00.000Z", projects: [] }), "utf-8");
    fs.writeFileSync(portfolioPath, v1Content);
    const expectedHash = crypto.createHash("sha256").update(v1Content).digest("hex");
    const expectedArchivePath = path.resolve(path.dirname(portfolioPath), `portfolio.legacy.${expectedHash}.json`);

    fs.writeFileSync(expectedArchivePath, Buffer.from("invalid-bytes"));
    if (process.platform !== "win32") fs.chmodSync(expectedArchivePath, 0o600);

    expect(() => migrateLegacyPortfolio("abc123def456abc123def456abc123de")).toThrowError("Pre-existing archive bytes mismatch");

    expect(fs.readFileSync(portfolioPath).equals(v1Content)).toBe(true);
    expect(fs.readFileSync(expectedArchivePath).toString()).toBe("invalid-bytes");
    expect(getRawPortfolioContent().isLegacy).toBe(true);
  });

  it("migrateLegacyPortfolio rejects migration if pre-existing archive is a symlink", () => {
    const v1Content = Buffer.from(JSON.stringify({ schemaVersion: 1, revision: "abc123def456abc123def456abc123de", updatedAt: "2024-01-01T00:00:00.000Z", projects: [] }), "utf-8");
    fs.writeFileSync(portfolioPath, v1Content);
    const expectedHash = crypto.createHash("sha256").update(v1Content).digest("hex");
    const expectedArchivePath = path.resolve(path.dirname(portfolioPath), `portfolio.legacy.${expectedHash}.json`);

    const dummyTarget = path.resolve(path.dirname(portfolioPath), "dummy.txt");
    fs.writeFileSync(dummyTarget, "dummy");
    fs.symlinkSync(dummyTarget, expectedArchivePath);

    expect(() => migrateLegacyPortfolio("abc123def456abc123def456abc123de")).toThrowError("Pre-existing archive is not a regular file");
    expect(fs.readFileSync(portfolioPath).equals(v1Content)).toBe(true);
    expect(getRawPortfolioContent().isLegacy).toBe(true);
  });

  it("migrateLegacyPortfolio rejects migration if pre-existing archive has wrong mode", () => {
    if (process.platform === "win32") return;
    const v1Content = Buffer.from(JSON.stringify({ schemaVersion: 1, revision: "abc123def456abc123def456abc123de", updatedAt: "2024-01-01T00:00:00.000Z", projects: [] }), "utf-8");
    fs.writeFileSync(portfolioPath, v1Content);
    const expectedHash = crypto.createHash("sha256").update(v1Content).digest("hex");
    const expectedArchivePath = path.resolve(path.dirname(portfolioPath), `portfolio.legacy.${expectedHash}.json`);

    fs.writeFileSync(expectedArchivePath, v1Content);
    fs.chmodSync(expectedArchivePath, 0o777);

    expect(() => migrateLegacyPortfolio("abc123def456abc123def456abc123de")).toThrowError("Pre-existing archive mode is not 0600");
    expect(fs.readFileSync(portfolioPath).equals(v1Content)).toBe(true);
    expect(getRawPortfolioContent().isLegacy).toBe(true);
  });

  it("creates, updates, reorders and deletes categories", () => {
    fs.writeFileSync(portfolioPath, JSON.stringify(createDefaultPortfolioV2()));
    let rev = getPortfolioContent().revision;


    rev = createCategory({ name: { fr: "Cat 1", en: "Cat 1 EN" }, slug: "cat-1", active: true }, rev);
    rev = createCategory({ name: { fr: "Cat 2", en: "Cat 2 EN" }, slug: "cat-2", active: true }, rev);

    const content = getPortfolioContent();
    expect(content.categories).toHaveLength(2);
    const cat1 = content.categories.find(c => c.slug === "cat-1")!;
    const cat2 = content.categories.find(c => c.slug === "cat-2")!;

    rev = updateCategory(cat1.id, { name: { fr: "Cat 1 updated", en: "Cat 1 EN" }, active: false }, rev);
    expect(getPortfolioContent().categories.find(c => c.id === cat1.id)?.active).toBe(false);

    rev = reorderCategories([cat2.id, cat1.id], rev);
    expect(getPortfolioContent().categories[0].id).toBe(cat2.id);

    deleteCategory(cat1.id, rev);
    expect(getPortfolioContent().categories).toHaveLength(1);
  });

  it("adds photo, updates metadata, checks visibility rules, trashes", () => {
    fs.writeFileSync(portfolioPath, JSON.stringify(createDefaultPortfolioV2()));
    let rev = getPortfolioContent().revision;


    rev = createCategory({ name: { fr: "Cat", en: "Cat" }, slug: "cat", active: true }, rev);
    const catId = getPortfolioContent().categories[0].id;

    const { newRevision, newPhotoId } = addPhotoToPortfolio({
      fileId: "12345678901234567890123456789012",
      originalFormat: "jpeg",
      originalWidth: 1000,
      originalHeight: 1000,
      variants: [
        { height: 480, width: 480, sizeBytes: 1024, name: "480p", fileId: "12345678901234567890123456789012-480p" }
      ],
      appliedWatermarkRevision: "12345678901234567890123456789012",
      processedAt: new Date().toISOString()
    }, rev);
    rev = newRevision;


    const content = getPortfolioContent();
    expect(content.photos).toHaveLength(1);
    expect(content.photos[0].id).toBe(newPhotoId);

    rev = updatePhotoMetadata(newPhotoId, { categoryId: catId, alt: { fr: "alt fr", en: "alt en" } }, rev);
    expect(getPortfolioContent().photos[0].categoryId).toBe(catId);

    rev = setPhotoVisibility(newPhotoId, true, rev);
    expect(getPortfolioContent().photos[0].visible).toBe(true);

    trashPhoto(newPhotoId, rev);
    expect(getPortfolioContent().photos).toHaveLength(0);
  });
});
