import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  getPortfolioContent,
  createProjectDraft,
  updateProjectMetadata,
  reorderProjects,
  deleteEmptyProject,
  portfolioSchema,
  updateWatermarkText,
  addPhotoToProject,
  publishProject,
  getPublishedProjects,
  getPublishedProjectBySlug,
  projectSchema,
} from "../app/lib/portfolio-content.server";
import { parseVideoUrl } from "../app/lib/video";

import { vi } from "vitest";

vi.mock("../app/lib/env.server", () => ({
  ENV: {
    get PORTFOLIO_CONTENT_PATH() { return process.env.PORTFOLIO_CONTENT_PATH || ""; },
    get PORTFOLIO_MEDIA_PATH() { return process.env.PORTFOLIO_MEDIA_PATH || ""; },
  }
}));

describe("portfolio-content.server", () => {
  let tempDir: string;
  let portfolioPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "portfolio-content-test-"));
    portfolioPath = path.join(tempDir, "portfolio.json");
    process.env.PORTFOLIO_CONTENT_PATH = portfolioPath;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.PORTFOLIO_CONTENT_PATH;
  });

  it("returns empty valid portfolio if file absent", () => {
    const portfolio = getPortfolioContent();
    expect(portfolio.projects).toEqual([]);
    expect(portfolio.schemaVersion).toBe(1);
    expect(portfolio.revision).toHaveLength(32);
  });

  it("reads valid JSON", () => {
    const valid = {
      schemaVersion: 1,
      revision: crypto.randomBytes(16).toString("hex"),
      updatedAt: new Date().toISOString(),
      projects: [],
    };
    fs.writeFileSync(portfolioPath, JSON.stringify(valid));
    const portfolio = getPortfolioContent();
    expect(portfolio.revision).toBe(valid.revision);
  });

  it("throws CorruptedContentError on corrupted JSON", () => {
    fs.writeFileSync(portfolioPath, "{ corrupted json");
    expect(() => getPortfolioContent()).toThrow("Corrupted content");
  });

  it("throws CorruptedContentError on unknown property via getPortfolioContent (portfolioStorageSchema)", () => {
    fs.writeFileSync(portfolioPath, JSON.stringify({
      schemaVersion: 1,
      revision: crypto.randomBytes(16).toString("hex"),
      updatedAt: new Date().toISOString(),
      projects: [],
      unknownProp: true
    }));
    expect(() => getPortfolioContent()).toThrow("Corrupted content");
  });

  it("fails portfolioSchema.safeParse on unknown property directly", () => {
    const valid = {
      schemaVersion: 1 as const,
      revision: crypto.randomBytes(16).toString("hex"),
      updatedAt: new Date().toISOString(),
      projects: [],
      watermark: {
        mode: "text" as const,
        text: "Test",
        revision: crypto.randomBytes(16).toString("hex"),
        updatedAt: new Date().toISOString(),
      },
    };

    // First: the valid object MUST pass
    expect(portfolioSchema.safeParse(valid).success).toBe(true);

    // Then: adding an unknown property MUST fail (proves .strict())
    const result = portfolioSchema.safeParse({
      ...valid,
      unknownProperty: true,
    });
    expect(result.success).toBe(false);
  });

  it("throws CorruptedContentError on invalid revision", () => {
    fs.writeFileSync(portfolioPath, JSON.stringify({
      schemaVersion: 1,
      revision: "too-short",
      updatedAt: new Date().toISOString(),
      projects: [],
    }));
    expect(() => getPortfolioContent()).toThrow("Corrupted content");
  });

  it("creates a draft project", () => {
    const rev = getPortfolioContent().revision;
    createProjectDraft({
      title: { fr: "Titre", en: "Title" },
      slug: { fr: "titre", en: "title" },
      description: { fr: "Desc", en: "Desc" },
      location: null,
      date: null,
    }, rev);

    const updated = getPortfolioContent();
    expect(updated.projects).toHaveLength(1);
    expect(updated.projects[0].status).toBe("draft");
    expect(updated.projects[0].title.fr).toBe("Titre");
  });

  it("prevents duplicate FR slugs", () => {
    let rev = getPortfolioContent().revision;
    rev = createProjectDraft({
      title: { fr: "T1", en: "T1" },
      slug: { fr: "slug1", en: "slug-en1" },
      description: { fr: "D1", en: "D1" },
      location: null,
      date: null,
    }, rev);

    createProjectDraft({
      title: { fr: "T2", en: "T2" },
      slug: { fr: "slug1", en: "slug2" }, // collision on fr
      description: { fr: "D", en: "D" },
      location: null,
      date: null,
    }, rev);
    const updatedProject = getPortfolioContent().projects.find(p => p.slug.fr === 'slug1-1');
    expect(updatedProject?.slug.fr).toBe('slug1-1');
  });

  it("allows modification of metadata", () => {
    let rev = getPortfolioContent().revision;
    rev = createProjectDraft({
      title: { fr: "T1", en: "T1" },
      slug: { fr: "slug1", en: "slug-en1" },
      description: { fr: "D1", en: "D1" },
      location: null,
      date: null,
    }, rev);

    const project = getPortfolioContent().projects[0];

    updateProjectMetadata(project.id, {
      title: { fr: "T1 Mod", en: "T1" },
      slug: { fr: "slug1-mod", en: "slug-en1" },
      description: { fr: "D1", en: "D1" },
      location: "Paris",
      date: "2025-01-01",
    }, rev);

    const updated = getPortfolioContent().projects[0];
    expect(updated.title.fr).toBe("T1 Mod");
    expect(updated.location).toBe("Paris");
    expect(updated.date).toBe("2025-01-01");
  });

  it("reorders projects", () => {
    let rev = getPortfolioContent().revision;
    rev = createProjectDraft({
      title: { fr: "T1", en: "T1" },
      slug: { fr: "slug1", en: "slug1" },
      description: { fr: "D", en: "D" },
      location: null, date: null,
    }, rev);

    rev = createProjectDraft({
      title: { fr: "T2", en: "T2" },
      slug: { fr: "slug2", en: "slug2" },
      description: { fr: "D", en: "D" },
      location: null, date: null,
    }, rev);

    const p1 = getPortfolioContent().projects[0].id;
    const p2 = getPortfolioContent().projects[1].id;

    reorderProjects([p2, p1], rev);
    const reordered = getPortfolioContent().projects.sort((a, b) => a.order - b.order);
    expect(reordered[0].id).toBe(p2);
    expect(reordered[1].id).toBe(p1);
  });

  it("deletes empty project", () => {
    let rev = getPortfolioContent().revision;
    rev = createProjectDraft({
      title: { fr: "T1", en: "T1" },
      slug: { fr: "slug1", en: "slug1" },
      description: { fr: "D", en: "D" },
      location: null, date: null,
    }, rev);

    const id = getPortfolioContent().projects[0].id;
    deleteEmptyProject(id, rev);

    expect(getPortfolioContent().projects).toHaveLength(0);
  });

  it("throws RevisionConflictError on concurrent mutation", () => {
    const rev = getPortfolioContent().revision;
    createProjectDraft({
      title: { fr: "Other", en: "Other" },
      slug: { fr: "other-fr", en: "other-en" },
      description: { fr: "Other desc", en: "Other desc" },
      location: null, date: null,
    }, rev);

    expect(() => createProjectDraft({
      title: { fr: "T2", en: "T2" },
      slug: { fr: "slug2", en: "slug2" },
      description: { fr: "D", en: "D" },
      location: null, date: null,
    }, rev)).toThrow("Revision conflict");
  });

  it("guarantees bytes unchanged on error", () => {
    let rev = getPortfolioContent().revision;
    rev = createProjectDraft({
      title: { fr: "T1", en: "T1" },
      slug: { fr: "slug1", en: "slug1" },
      description: { fr: "D", en: "D" },
      location: null, date: null,
    }, rev);

    const contentBefore = fs.readFileSync(portfolioPath, "utf-8");

    expect(() => createProjectDraft({
      title: { fr: "T2", en: "T2" },
      slug: { fr: "slug2", en: "slug2" },
      description: { fr: "D", en: "D" },
      location: null, date: null,
    }, rev + 'x')).toThrow();

    const contentAfter = fs.readFileSync(portfolioPath, "utf-8");
    expect(contentAfter).toBe(contentBefore);

    // Ensure no temp files leaked
    const files = fs.readdirSync(tempDir);
    expect(files.filter(f => f.includes(".tmp."))).toHaveLength(0);
  });

  it("throws RevisionConflictError on concurrent mutation in updateWatermarkText using spy", () => {
    // Write something to ensure the file actually exists on disk
    let rev = getPortfolioContent().revision;
    rev = createProjectDraft({
      title: { fr: "Init", en: "Init" },
      slug: { fr: "init", en: "init" },
      description: { fr: "Init", en: "Init" },
      location: null, date: null,
    }, rev);

    let callCount = 0;
    const originalReadFileSync = fs.readFileSync;

    const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation((pathArg, options) => {
      // Only intercept calls to portfolio.json
      if (pathArg.toString().includes("portfolio.json")) {
        callCount++;
        if (callCount === 2) {
          // Just before the second read (which is inside getRawPortfolioContent),
          // simulate a concurrent write by writing a valid JSON with a new revision and a dummy project
          const concurrentContent = {
            schemaVersion: 1,
            revision: "11111111111111111111111111111111", // NEW REVISION
            updatedAt: new Date().toISOString(),
            projects: [],
            watermark: {
              mode: "text",
              text: "Timeless",
              revision: "22222222222222222222222222222222",
              updatedAt: new Date().toISOString()
            }
          };
          originalReadFileSync(pathArg, options); // Ensure it's readable, but we overwrite it
          fs.writeFileSync(pathArg, JSON.stringify(concurrentContent, null, 2));
        }
      }
      return originalReadFileSync(pathArg, options);
    });

    try {
      expect(() => {
        updateWatermarkText("Nouveau filigrane", rev);
      }).toThrow("Revision conflict");

      const contentAfter = JSON.parse(fs.readFileSync(portfolioPath, "utf-8"));
      // The concurrent write must be intact
      expect(contentAfter.revision).toBe("11111111111111111111111111111111");
      expect(contentAfter.watermark.text).toBe("Timeless");

      const backups = fs.readdirSync(tempDir).filter(f => f.startsWith("portfolio.json.backup"));
      expect(backups).toHaveLength(0);

      // Ensure no temp files leaked
      const files = fs.readdirSync(tempDir);
      expect(files.filter(f => f.includes(".tmp."))).toHaveLength(0);
    } finally {
      readSpy.mockRestore();
    }
  });

  describe("Validation stricte des métadonnées", () => {
    let rev: string;
    beforeEach(() => {
      rev = getPortfolioContent().revision;
    });

    it("refuse un titre vide ou composé d'espaces", () => {
      expect(() => createProjectDraft({
        title: { fr: "   ", en: "Title" },
        slug: { fr: "titre", en: "title" },
        description: { fr: "Desc", en: "Desc" },
        location: null, date: null,
      }, rev)).toThrow("Title is required");

      expect(() => createProjectDraft({
        title: { fr: "Titre", en: "" },
        slug: { fr: "titre", en: "title" },
        description: { fr: "Desc", en: "Desc" },
        location: null, date: null,
      }, rev)).toThrow("Title is required");
    });

    it("refuse une description vide ou composée d'espaces", () => {
      expect(() => createProjectDraft({
        title: { fr: "Titre", en: "Title" },
        slug: { fr: "titre", en: "title" },
        description: { fr: "   \n  ", en: "Desc" },
        location: null, date: null,
      }, rev)).toThrow("Text is required");
    });

    it("refuse du HTML dans le titre et la description", () => {
      expect(() => createProjectDraft({
        title: { fr: "Titre <script>", en: "Title" },
        slug: { fr: "titre", en: "title" },
        description: { fr: "Desc", en: "Desc" },
        location: null, date: null,
      }, rev)).toThrow("HTML is not allowed");

      expect(() => createProjectDraft({
        title: { fr: "Titre", en: "Title" },
        slug: { fr: "titre", en: "title" },
        description: { fr: "<b>Desc</b>", en: "Desc" },
        location: null, date: null,
      }, rev)).toThrow("HTML is not allowed");
    });

    it("refuse une date impossible ou un timestamp", () => {
      expect(() => createProjectDraft({
        title: { fr: "Titre", en: "Title" },
        slug: { fr: "titre", en: "title" },
        description: { fr: "Desc", en: "Desc" },
        location: null, date: "2024-13-45",
      }, rev)).toThrow("Invalid date format or impossible date");

      expect(() => createProjectDraft({
        title: { fr: "Titre", en: "Title" },
        slug: { fr: "titre", en: "title" },
        description: { fr: "Desc", en: "Desc" },
        location: null, date: "1700000000",
      }, rev)).toThrow("Invalid date format or impossible date");
    });

    it("auto-génère et gère les collisions de slug", () => {
      rev = createProjectDraft({
        title: { fr: "Mon beau mariage !", en: "My beautiful wedding !" },
        slug: { fr: "", en: "" },
        description: { fr: "Desc", en: "Desc" },
        location: null, date: null,
      }, rev);

      let portfolio = getPortfolioContent();
      expect(portfolio.projects[0].slug.fr).toBe("mon-beau-mariage");
      expect(portfolio.projects[0].slug.en).toBe("my-beautiful-wedding");

      // Auto collision
      createProjectDraft({
        title: { fr: "Mon beau mariage !", en: "My beautiful wedding !" },
        slug: { fr: "", en: "" },
        description: { fr: "Desc", en: "Desc" },
        location: null, date: null,
      }, rev);

      portfolio = getPortfolioContent();
      const p2 = portfolio.projects.find(p => p.id !== portfolio.projects[0].id)!;
      expect(p2.slug.fr).toMatch(/^mon-beau-mariage(-[0-9]+)?$/);
      expect(p2.slug.fr).not.toBe("mon-beau-mariage");
    });

    it("n'expose publiquement qu'un projet publié et le retrouve dans les deux langues", () => {
      rev = createProjectDraft({
        title: { fr: "Mariage à Ath", en: "Wedding in Ath" },
        slug: { fr: "", en: "" },
        description: { fr: "Une belle journée", en: "A beautiful day" },
        location: "Ath",
        date: "2026-06-29",
      }, rev);

      const project = getPortfolioContent().projects[0];
      const added = addPhotoToProject(project.id, {
        fileId: "1".repeat(32),
        originalFormat: "jpeg",
        originalWidth: 1200,
        originalHeight: 800,
        category: "ceremony",
        alt: { fr: "Les mariés", en: "The newlyweds" },
        variants: [{
          name: "480p",
          width: 480,
          height: 320,
          sizeBytes: 1234,
          fileId: "1".repeat(32) + "-480p",
        }],
        appliedWatermarkRevision: "2".repeat(32),
        processedAt: new Date().toISOString(),
      }, rev);

      expect(getPublishedProjects()).toEqual([]);

      publishProject(project.id, added.newRevision);
      const publicProjects = getPublishedProjects();
      expect(publicProjects).toHaveLength(1);
      expect(publicProjects[0].title.fr).toBe("Mariage à Ath");
      expect(publicProjects[0]).not.toHaveProperty("status");
      expect(publicProjects[0].photos[0]).not.toHaveProperty("fileId");
      expect(getPublishedProjectBySlug("fr", "mariage-a-ath")?.id).toBe(project.id);
      expect(getPublishedProjectBySlug("en", "wedding-in-ath")?.id).toBe(project.id);
      expect(getPublishedProjectBySlug("fr", "../portfolio.json")).toBeUndefined();
    });
  });

  describe("Parsing et migration des vidéos", () => {
    it("parse correctement les URLs YouTube", () => {
      expect(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ provider: "youtube", videoId: "dQw4w9WgXcQ" });
      expect(parseVideoUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ provider: "youtube", videoId: "dQw4w9WgXcQ" });
      expect(parseVideoUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ provider: "youtube", videoId: "dQw4w9WgXcQ" });
      expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({ provider: "youtube", videoId: "dQw4w9WgXcQ" });
      expect(parseVideoUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toEqual({ provider: "youtube", videoId: "dQw4w9WgXcQ" });
      expect(parseVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({ provider: "youtube", videoId: "dQw4w9WgXcQ" });
    });

    it("parse correctement les URLs Vimeo", () => {
      expect(parseVideoUrl("https://vimeo.com/123456789")).toEqual({ provider: "vimeo", videoId: "123456789" });
      expect(parseVideoUrl("https://www.vimeo.com/123456789")).toEqual({ provider: "vimeo", videoId: "123456789" });
      expect(parseVideoUrl("https://player.vimeo.com/video/123456789")).toEqual({ provider: "vimeo", videoId: "123456789" });
    });

    it("rejette les faux domaines et URLs malveillantes", () => {
      expect(parseVideoUrl("https://youtube.com.example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
      expect(parseVideoUrl("https://evil-youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
      expect(parseVideoUrl("https://vimeo.com.example.com/123456789")).toBeNull();
      expect(parseVideoUrl("https://evilvimeo.com/123456789")).toBeNull();
      expect(parseVideoUrl("https://dailymotion.com/video/x123")).toBeNull();
    });

    it("rejette les formats invalides (HTTP, sans ID, identifiants utilisateur)", () => {
      expect(parseVideoUrl("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
      expect(parseVideoUrl("https://www.youtube.com/watch?v=SHORT")).toBeNull(); // ID trop court (< 11)
      expect(parseVideoUrl("https://www.youtube.com/watch")).toBeNull();
      expect(parseVideoUrl("https://vimeo.com/abcde")).toBeNull(); // non numérique
      expect(parseVideoUrl("https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    });

    it("migre un ancien videoUrl valide vers video et supprime videoUrl", () => {
      const parsed = projectSchema.safeParse({
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: { fr: "AAA", en: "AAA" },
        slug: { fr: "aaa", en: "aaa" },
        description: { fr: "AAA", en: "AAA" },
        location: null,
        date: null,
        status: "draft",
        order: 0,
        coverPhotoId: null,
        photos: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        videoUrl: "https://vimeo.com/123456789"
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.video).toEqual({ provider: "vimeo", videoId: "123456789" });
        expect(parsed.data).not.toHaveProperty("videoUrl");
      }
    });

    it("rejette une ancienne URL invalide comme contenu corrompu", () => {
      const parsed = projectSchema.safeParse({
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: { fr: "AAA", en: "AAA" },
        slug: { fr: "aaa", en: "aaa" },
        description: { fr: "AAA", en: "AAA" },
        location: null,
        date: null,
        status: "draft",
        order: 0,
        coverPhotoId: null,
        photos: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        videoUrl: "https://evil-youtube.com/watch?v=dQw4w9WgXcQ"
      });
      expect(parsed.success).toBe(false);
    });

    it("rejette un videoUrl de mauvais type", () => {
      const parsed = projectSchema.safeParse({
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: { fr: "AAA", en: "AAA" },
        slug: { fr: "aaa", en: "aaa" },
        description: { fr: "AAA", en: "AAA" },
        location: null,
        date: null,
        status: "draft",
        order: 0,
        coverPhotoId: null,
        photos: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        videoUrl: 12345
      });
      expect(parsed.success).toBe(false);
    });

    it("rejette la présence simultanée de video et videoUrl", () => {
      const parsed = projectSchema.safeParse({
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: { fr: "AAA", en: "AAA" },
        slug: { fr: "aaa", en: "aaa" },
        description: { fr: "AAA", en: "AAA" },
        location: null,
        date: null,
        status: "draft",
        order: 0,
        coverPhotoId: null,
        photos: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        videoUrl: "https://vimeo.com/123456789",
        video: { provider: "vimeo", videoId: "123456789" }
      });
      expect(parsed.success).toBe(false);
    });

    it("valide un objet YouTube stocké valide", () => {
      const parsed = projectSchema.safeParse({
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: { fr: "AAA", en: "AAA" },
        slug: { fr: "aaa", en: "aaa" },
        description: { fr: "AAA", en: "AAA" },
        location: null,
        date: null,
        status: "draft",
        order: 0,
        coverPhotoId: null,
        photos: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        video: { provider: "youtube", videoId: "dQw4w9WgXcQ" }
      });
      expect(parsed.success).toBe(true);
    });

    it("valide un objet Vimeo stocké valide", () => {
      const parsed = projectSchema.safeParse({
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: { fr: "AAA", en: "AAA" },
        slug: { fr: "aaa", en: "aaa" },
        description: { fr: "AAA", en: "AAA" },
        location: null,
        date: null,
        status: "draft",
        order: 0,
        coverPhotoId: null,
        photos: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        video: { provider: "vimeo", videoId: "123456789" }
      });
      expect(parsed.success).toBe(true);
    });

    it("rejette un objet YouTube avec ID trop court, trop long ou invalide", () => {
      const base = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: { fr: "AAA", en: "AAA" },
        slug: { fr: "aaa", en: "aaa" },
        description: { fr: "AAA", en: "AAA" },
        location: null,
        date: null,
        status: "draft",
        order: 0,
        coverPhotoId: null,
        photos: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      expect(projectSchema.safeParse({ ...base, video: { provider: "youtube", videoId: "short" } }).success).toBe(false);
      expect(projectSchema.safeParse({ ...base, video: { provider: "youtube", videoId: "waytoolongidfortheyoutubevideo" } }).success).toBe(false);
      expect(projectSchema.safeParse({ ...base, video: { provider: "youtube", videoId: "invalid@char" } }).success).toBe(false);
    });

    it("rejette un objet Vimeo avec ID non numérique ou trop long", () => {
      const base = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: { fr: "AAA", en: "AAA" },
        slug: { fr: "aaa", en: "aaa" },
        description: { fr: "AAA", en: "AAA" },
        location: null,
        date: null,
        status: "draft",
        order: 0,
        coverPhotoId: null,
        photos: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      expect(projectSchema.safeParse({ ...base, video: { provider: "vimeo", videoId: "abcdefgh" } }).success).toBe(false);
      expect(projectSchema.safeParse({ ...base, video: { provider: "vimeo", videoId: "12345678901234567" } }).success).toBe(false);
    });

    it("rejette des propriétés inconnues dans video", () => {
      const parsed = projectSchema.safeParse({
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: { fr: "AAA", en: "AAA" },
        slug: { fr: "aaa", en: "aaa" },
        description: { fr: "AAA", en: "AAA" },
        location: null,
        date: null,
        status: "draft",
        order: 0,
        coverPhotoId: null,
        photos: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        video: { provider: "youtube", videoId: "dQw4w9WgXcQ", unknownProp: true }
      });
      expect(parsed.success).toBe(false);
    });

    it("normalise l'absence de vidéo en video: null", () => {
      const parsed = projectSchema.safeParse({
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: { fr: "AAA", en: "AAA" },
        slug: { fr: "aaa", en: "aaa" },
        description: { fr: "AAA", en: "AAA" },
        location: null,
        date: null,
        status: "draft",
        order: 0,
        coverPhotoId: null,
        photos: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.video).toBeNull();
      }
    });

    it("la lecture de migration ne réécrit pas le JSON automatiquement", () => {
      // Create a raw mock JSON file with videoUrl instead of video
      const rawProject = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        title: { fr: "AAA", en: "AAA" },
        slug: { fr: "aaa", en: "aaa" },
        description: { fr: "AAA", en: "AAA" },
        location: null,
        date: null,
        status: "draft",
        order: 0,
        coverPhotoId: null,
        photos: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        videoUrl: "https://vimeo.com/123456789"
      };
      const valid = {
        schemaVersion: 1,
        revision: crypto.randomBytes(16).toString("hex"),
        updatedAt: new Date().toISOString(),
        projects: [rawProject],
      };

      const portfolioPathLocal = process.env.PORTFOLIO_CONTENT_PATH!;
      fs.writeFileSync(portfolioPathLocal, JSON.stringify(valid));

      const contentBefore = fs.readFileSync(portfolioPathLocal, "utf-8");

      const portfolio = getPortfolioContent();
      expect(portfolio.projects[0].video).toEqual({ provider: "vimeo", videoId: "123456789" });

      const contentAfter = fs.readFileSync(portfolioPathLocal, "utf-8");
      expect(contentAfter).toBe(contentBefore); // file untouched
    });
  });
});
