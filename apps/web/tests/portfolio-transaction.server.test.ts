import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deletePhotoTransactionally, TransactionRollbackError } from "../app/lib/portfolio-transaction.server";
import * as portfolioContent from "../app/lib/portfolio-content.server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let contentPath: string;
let mediaPath: string;

vi.mock("../app/lib/env.server", () => ({
  ENV: {
    get PORTFOLIO_CONTENT_PATH() { return process.env.PORTFOLIO_CONTENT_PATH || ""; },
    get PORTFOLIO_MEDIA_PATH() { return process.env.PORTFOLIO_MEDIA_PATH || ""; }
  }
}));

describe("portfolio-transaction.server.test.ts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-trans-"));
    contentPath = path.join(tempDir, "portfolio.json");
    mediaPath = path.join(tempDir, "media");
    fs.mkdirSync(mediaPath);

    process.env.PORTFOLIO_CONTENT_PATH = contentPath;
    process.env.PORTFOLIO_MEDIA_PATH = mediaPath;

    // Initial state
    const initialPortfolio = {
      schemaVersion: 2,
      revision: "12345678901234567890123456789012",
      updatedAt: new Date().toISOString(),
      categories: [],
      photos: [
        {
          id: "3e5a408b-59d8-4f81-a75d-8547434a36b3",
          fileId: "00000000000000000000000000000000",
          originalFormat: "jpeg",
          originalWidth: 100,
          originalHeight: 100,
          categoryId: null,
          alt: { fr: "fr", en: "en" },
          visible: false,
          variants: [{ name: "480p", width: 100, height: 100, fileId: "00000000000000000000000000000000-480p", sizeBytes: 1000 }],
          order: 0,
          appliedWatermarkRevision: "00000000000000000000000000000000",
          processedAt: new Date().toISOString()
        }
      ],
      video: null,
      watermark: { mode: "text", text: "Test", revision: "00000000000000000000000000000000", updatedAt: new Date().toISOString() }
    };
    fs.writeFileSync(contentPath, JSON.stringify(initialPortfolio));

    // Media dirs
    const photoDir = path.join(mediaPath, "global-v2", "photos", "3e5a408b-59d8-4f81-a75d-8547434a36b3");
    fs.mkdirSync(path.join(photoDir, "originals"), { recursive: true });
    fs.mkdirSync(path.join(photoDir, "480p"), { recursive: true });
    fs.writeFileSync(path.join(photoDir, "originals", "00000000000000000000000000000000.jpeg"), "original");
    fs.writeFileSync(path.join(photoDir, "480p", "00000000000000000000000000000000-480p.webp"), "variant");
  });

  afterEach(() => {
    delete process.env.PORTFOLIO_CONTENT_PATH;
    delete process.env.PORTFOLIO_MEDIA_PATH;
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("succès: déplace les médias puis mute le JSON", () => {
    const result = deletePhotoTransactionally("3e5a408b-59d8-4f81-a75d-8547434a36b3", "12345678901234567890123456789012");

    expect(result.newRevision).not.toBe("12345678901234567890123456789012");

    const parsed = JSON.parse(fs.readFileSync(contentPath, "utf-8"));
    expect(parsed.photos).toHaveLength(0);

    const trashDir = path.join(mediaPath, "global-v2", ".trash", "3e5a408b-59d8-4f81-a75d-8547434a36b3");
    expect(fs.existsSync(trashDir)).toBe(true);
    expect(fs.existsSync(path.join(trashDir, "manifest.json"))).toBe(true);
    expect(fs.readFileSync(path.join(trashDir, "originals", "00000000000000000000000000000000.jpeg"), "utf-8")).toBe("original");
    expect(fs.readFileSync(path.join(trashDir, "480p", "00000000000000000000000000000000-480p.webp"), "utf-8")).toBe("variant");

    expect(fs.existsSync(path.join(mediaPath, "global-v2", "photos", "3e5a408b-59d8-4f81-a75d-8547434a36b3"))).toBe(false);
  });

  it("média manquant: échoue proprement et ne mute pas le JSON", () => {
    fs.unlinkSync(path.join(mediaPath, "global-v2", "photos", "3e5a408b-59d8-4f81-a75d-8547434a36b3", "originals", "00000000000000000000000000000000.jpeg"));

    expect(() => deletePhotoTransactionally("3e5a408b-59d8-4f81-a75d-8547434a36b3", "12345678901234567890123456789012")).toThrow("Expected photo media is unavailable.");

    const parsed = JSON.parse(fs.readFileSync(contentPath, "utf-8"));
    expect(parsed.photos).toHaveLength(1);
    expect(fs.existsSync(path.join(mediaPath, "global-v2", ".trash", "3e5a408b-59d8-4f81-a75d-8547434a36b3"))).toBe(false);
  });

  it("échec du rename avant mutation JSON (ex: permission denied)", () => {
    try {
      expect(() => deletePhotoTransactionally(
        "3e5a408b-59d8-4f81-a75d-8547434a36b3",
        "12345678901234567890123456789012",
        () => { throw new Error("EACCES: permission denied"); }
      )).toThrow("Failed to trash photo media");

      const parsed = JSON.parse(fs.readFileSync(contentPath, "utf-8"));
      expect(parsed.photos).toHaveLength(1);
      expect(fs.existsSync(path.join(mediaPath, "global-v2", "photos", "3e5a408b-59d8-4f81-a75d-8547434a36b3"))).toBe(true);
      expect(fs.existsSync(path.join(mediaPath, "global-v2", ".trash", "3e5a408b-59d8-4f81-a75d-8547434a36b3"))).toBe(false);
    } finally {
      // no cleanup needed for mock
    }
  });

  it("conflit de révision (détecté AVANT mutation): échoue immédiatement sans toucher aux médias", () => {
    expect(() => deletePhotoTransactionally("3e5a408b-59d8-4f81-a75d-8547434a36b3", "wrong_revision")).toThrow("Revision conflict");

    const parsed = JSON.parse(fs.readFileSync(contentPath, "utf-8"));
    expect(parsed.photos).toHaveLength(1);
    expect(fs.existsSync(path.join(mediaPath, "global-v2", "photos", "3e5a408b-59d8-4f81-a75d-8547434a36b3"))).toBe(true);
  });

  it("échec de l'écriture JSON APRÈS déplacement: rollback restaure les médias", () => {
    const originalJsonBytes = fs.readFileSync(contentPath);

    vi.spyOn(portfolioContent, "trashPhoto").mockImplementation(() => {
      throw new Error("Simulated JSON write error");
    });

    expect(() => deletePhotoTransactionally("3e5a408b-59d8-4f81-a75d-8547434a36b3", "12345678901234567890123456789012")).toThrow("Simulated JSON write error");

    const afterJsonBytes = fs.readFileSync(contentPath);
    expect(afterJsonBytes.equals(originalJsonBytes)).toBe(true);

    const photoDir = path.join(mediaPath, "global-v2", "photos", "3e5a408b-59d8-4f81-a75d-8547434a36b3");
    expect(fs.existsSync(photoDir)).toBe(true);
    expect(fs.existsSync(path.join(photoDir, "originals", "00000000000000000000000000000000.jpeg"))).toBe(true);
    expect(fs.existsSync(path.join(photoDir, "480p", "00000000000000000000000000000000-480p.webp"))).toBe(true);
    expect(fs.existsSync(path.join(photoDir, "manifest.json"))).toBe(false);

    const trashDir = path.join(mediaPath, "global-v2", ".trash", "3e5a408b-59d8-4f81-a75d-8547434a36b3");
    expect(fs.existsSync(trashDir)).toBe(false);
  });

  it("échec du rollback: lance TransactionRollbackError", () => {
    vi.spyOn(portfolioContent, "trashPhoto").mockImplementation(() => {
      fs.rmSync(path.join(mediaPath, "global-v2", ".trash"), { recursive: true, force: true });
      throw new Error("Simulated JSON save failure");
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => deletePhotoTransactionally("3e5a408b-59d8-4f81-a75d-8547434a36b3", "12345678901234567890123456789012")).toThrow(TransactionRollbackError);

    expect(consoleSpy).toHaveBeenCalled();
  });
});
