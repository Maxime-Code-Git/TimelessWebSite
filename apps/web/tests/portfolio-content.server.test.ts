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
} from "../app/lib/portfolio-content.server";

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

  it("throws CorruptedContentError on unknown property", () => {
    fs.writeFileSync(portfolioPath, JSON.stringify({
      schemaVersion: 1,
      revision: crypto.randomBytes(16).toString("hex"),
      updatedAt: new Date().toISOString(),
      projects: [],
      unknownProp: true
    }));
    expect(() => getPortfolioContent()).toThrow("Corrupted content");
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

    expect(() => createProjectDraft({
      title: { fr: "T2", en: "T2" },
      slug: { fr: "slug1", en: "slug-en2" },
      description: { fr: "D2", en: "D2" },
      location: null,
      date: null,
    }, rev)).toThrow("FR slug 'slug1' is already used");
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
      status: "draft",
    }, rev);

    const updated = getPortfolioContent().projects[0];
    expect(updated.title.fr).toBe("T1 Mod");
    expect(updated.location).toBe("Paris");
    expect(updated.date).toBe("2025-01-01");
  });

  it("refuses to publish without photos and cover", () => {
    let rev = getPortfolioContent().revision;
    rev = createProjectDraft({
      title: { fr: "T1", en: "T1" },
      slug: { fr: "slug1", en: "slug-en1" },
      description: { fr: "D1", en: "D1" },
      location: null,
      date: null,
    }, rev);

    const project = getPortfolioContent().projects[0];

    expect(() => updateProjectMetadata(project.id, {
      title: { fr: "T1", en: "T1" },
      slug: { fr: "slug1", en: "slug-en1" },
      description: { fr: "D1", en: "D1" },
      location: null,
      date: null,
      status: "published",
    }, rev)).toThrow("Cannot publish a project without photos");
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
      slug: { fr: "slug1", en: "slug2" }, // collision
      description: { fr: "D", en: "D" },
      location: null, date: null,
    }, rev)).toThrow();

    const contentAfter = fs.readFileSync(portfolioPath, "utf-8");
    expect(contentAfter).toBe(contentBefore);

    // Ensure no temp files leaked
    const files = fs.readdirSync(tempDir);
    expect(files.filter(f => f.includes(".tmp."))).toHaveLength(0);
  });
});
