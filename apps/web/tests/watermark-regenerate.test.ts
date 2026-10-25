import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import sharp from "sharp";

// Mock env-loader to prevent .env.local from loading
vi.mock("../../../../scripts/env-loader.js", () => ({}));

let tempDir: string;
let contentPath: string;
let mediaPath: string;

vi.mock("../app/lib/env.server", () => ({
  ENV: {
    get PORTFOLIO_CONTENT_PATH() { return contentPath; },
    get PORTFOLIO_MEDIA_PATH() { return mediaPath; },
    PUBLIC_SITE_URL: "https://example.com",
    TRUST_PROXY: true,
    ADMIN_SESSION_SECRET: "12345678901234567890123456789012",
    ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=19456,t=2,p=1$abc$def",
  }
}));

import {
  regeneratePhotoWatermark,
  regenerateNextOutdatedPhoto,
} from "../app/lib/portfolio-transaction.server";
import {
  getPortfolioContent,
  type Portfolio,
} from "../app/lib/portfolio-content.server";
import {
  SafeImageError,
  _resetFontCache,
} from "../app/lib/portfolio-image.server";
import { action, loader } from "../app/routes/admin.portfolio.watermark";
import { getSession, commitSession } from "../app/lib/session.server";
import { computeCredentialVersion } from "../app/lib/auth.server";
import { getPublicPhotoUrl, getPublicPhotoSrcSet } from "../app/routes/PortfolioPage";

describe("Portfolio Watermark Regeneration Engine & HTTP Route", () => {
  const INITIAL_REV = "11111111111111111111111111111111";
  const OLD_WM_REV = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const NEW_WM_REV = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const PHOTO_ID = "3e5a408b-59d8-4f81-a75d-8547434a36b3";
  const FILE_ID = "00000000000000000000000000000000";

  let initialPortfolio: Portfolio;

  beforeEach(async () => {
    vi.restoreAllMocks();
    _resetFontCache();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeless-regen-test-"));
    contentPath = path.join(tempDir, "portfolio.json");
    mediaPath = path.join(tempDir, "media");
    fs.mkdirSync(mediaPath, { mode: 0o700 });

    // Setup base directory structure
    const photoDir = path.join(mediaPath, "global-v2", "photos", PHOTO_ID);
    fs.mkdirSync(path.join(photoDir, "originals"), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(photoDir, "480p"), { recursive: true, mode: 0o700 });

    // Create a real JPEG for the original
    const origJpeg = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 120, g: 150, b: 180 } }
    }).jpeg({ quality: 80 }).toBuffer();

    const originalFilePath = path.join(photoDir, "originals", `${FILE_ID}.jpeg`);
    fs.writeFileSync(originalFilePath, origJpeg, { mode: 0o600 });

    // Create initial variant with OLD watermark revision
    const oldVariant = await sharp({
      create: { width: 480, height: 360, channels: 3, background: { r: 50, g: 50, b: 50 } }
    }).webp({ quality: 80 }).toBuffer();

    const variantFilePath = path.join(photoDir, "480p", `${FILE_ID}-480p.webp`);
    fs.writeFileSync(variantFilePath, oldVariant, { mode: 0o600 });

    // Setup portfolio JSON with new watermark revision, but photo still on old watermark revision
    initialPortfolio = {
      schemaVersion: 2,
      revision: INITIAL_REV,
      updatedAt: new Date().toISOString(),
      categories: [
        {
          id: "99999999-9999-4000-8000-999999999999",
          name: { fr: "Mariages", en: "Weddings" },
          slug: "mariages",
          order: 0,
          active: true,
        }
      ],
      photos: [
        {
          id: PHOTO_ID,
          fileId: FILE_ID,
          originalFormat: "jpeg",
          originalWidth: 800,
          originalHeight: 600,
          categoryId: "99999999-9999-4000-8000-999999999999",
          alt: { fr: "Photo de test", en: "Test photo" },
          visible: true,
          variants: [
            {
              name: "480p",
              width: 480,
              height: 360,
              fileId: `${FILE_ID}-480p`,
              sizeBytes: oldVariant.length,
            }
          ],
          appliedWatermarkRevision: OLD_WM_REV,
          processedAt: new Date().toISOString(),
          order: 0,
        }
      ],
      video: {
        provider: "youtube",
        videoId: "dQw4w9WgXcQ",
        cover: {
          imageId: "88888888-8888-4000-8000-888888888888",
          variants: [
            { name: "480p", width: 480, height: 360, fileId: "11111111111111111111111111111111-480p" }
          ]
        }
      },
      watermark: {
        mode: "text",
        text: "Sempra Nouveau",
        revision: NEW_WM_REV,
        updatedAt: new Date().toISOString(),
      }
    };

    fs.writeFileSync(contentPath, JSON.stringify(initialPortfolio, null, 2), { mode: 0o600 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function getFileSha256(filePath: string): string {
    const data = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  async function createAdminCookie(csrfToken = "valid-csrf-token", authenticated = true) {
    const session = await getSession();
    if (csrfToken) {
      session.set("csrfToken", csrfToken);
    }
    if (authenticated) {
      session.set("adminId", "admin-123");
      session.set("credentialVersion", computeCredentialVersion());
    }
    return await commitSession(session);
  }

  // Minimum required Vitest test 1 & 2
  it("1 & 2: une variante portant l'ancienne révision est régénérée et appliedWatermarkRevision reçoit la nouvelle révision", async () => {
    const variantPath = path.join(mediaPath, "global-v2", "photos", PHOTO_ID, "480p", `${FILE_ID}-480p.webp`);
    const oldVariantHash = getFileSha256(variantPath);

    const result = await regeneratePhotoWatermark(PHOTO_ID, INITIAL_REV, { mediaBasePath: mediaPath });

    expect(result.photoId).toBe(PHOTO_ID);
    expect(result.alreadyUpToDate).toBe(false);
    expect(result.appliedWatermarkRevision).toBe(NEW_WM_REV);
    expect(result.newPortfolioRevision).not.toBe(INITIAL_REV);

    // Verify file content changed
    const newVariantHash = getFileSha256(variantPath);
    expect(newVariantHash).not.toBe(oldVariantHash);

    // Verify JSON updated
    const updated = getPortfolioContent();
    const photo = updated.photos.find(p => p.id === PHOTO_ID);
    expect(photo?.appliedWatermarkRevision).toBe(NEW_WM_REV);
  });

  // Minimum required Vitest test 3
  it("3: l'original reste strictement identique, hash SHA-256 avant/après", async () => {
    const originalPath = path.join(mediaPath, "global-v2", "photos", PHOTO_ID, "originals", `${FILE_ID}.jpeg`);
    const hashBefore = getFileSha256(originalPath);

    await regeneratePhotoWatermark(PHOTO_ID, INITIAL_REV, { mediaBasePath: mediaPath });

    const hashAfter = getFileSha256(originalPath);
    expect(hashAfter).toBe(hashBefore);
  });

  // Minimum required Vitest test 4
  it("4: catégories, ordre, visibilité et textes alternatifs restent identiques", async () => {
    const before = getPortfolioContent().photos.find(p => p.id === PHOTO_ID)!;

    await regeneratePhotoWatermark(PHOTO_ID, INITIAL_REV, { mediaBasePath: mediaPath });

    const after = getPortfolioContent().photos.find(p => p.id === PHOTO_ID)!;
    expect(after.id).toBe(before.id);
    expect(after.categoryId).toBe(before.categoryId);
    expect(after.order).toBe(before.order);
    expect(after.visible).toBe(before.visible);
    expect(after.alt.fr).toBe(before.alt.fr);
    expect(after.alt.en).toBe(before.alt.en);
  });

  // Minimum required Vitest test 5
  it("5: une photo déjà à jour est ignorée", async () => {
    // First run updates photo to current revision
    const first = await regeneratePhotoWatermark(PHOTO_ID, INITIAL_REV, { mediaBasePath: mediaPath });
    expect(first.alreadyUpToDate).toBe(false);

    const variantPath = path.join(mediaPath, "global-v2", "photos", PHOTO_ID, "480p", `${FILE_ID}-480p.webp`);
    const mtimeAfterFirst = fs.statSync(variantPath).mtimeMs;

    // Second run: photo is already up to date
    const second = await regeneratePhotoWatermark(PHOTO_ID, first.newPortfolioRevision, { mediaBasePath: mediaPath });
    expect(second.alreadyUpToDate).toBe(true);
    expect(second.newPortfolioRevision).toBe(first.newPortfolioRevision);

    const mtimeAfterSecond = fs.statSync(variantPath).mtimeMs;
    expect(mtimeAfterSecond).toBe(mtimeAfterFirst);
  });

  // Minimum required Vitest test 6
  it("6: plusieurs exécutions sont idempotentes", async () => {
    const res1 = await regenerateNextOutdatedPhoto(INITIAL_REV, { mediaBasePath: mediaPath });
    expect(res1.done).toBe(true);
    expect(res1.outdatedPhotos).toBe(0);

    const res2 = await regenerateNextOutdatedPhoto(res1.portfolioRevision, { mediaBasePath: mediaPath });
    expect(res2.done).toBe(true);
    expect(res2.outdatedPhotos).toBe(0);
    expect(res2.portfolioRevision).toBe(res1.portfolioRevision);
  });

  // Minimum required Vitest test 7
  it("7: un original manquant produit une erreur propre sans modification", async () => {
    const originalPath = path.join(mediaPath, "global-v2", "photos", PHOTO_ID, "originals", `${FILE_ID}.jpeg`);
    fs.unlinkSync(originalPath);

    const jsonBefore = fs.readFileSync(contentPath, "utf-8");

    await expect(
      regeneratePhotoWatermark(PHOTO_ID, INITIAL_REV, { mediaBasePath: mediaPath })
    ).rejects.toThrow(SafeImageError);

    const jsonAfter = fs.readFileSync(contentPath, "utf-8");
    expect(jsonAfter).toBe(jsonBefore);
  });

  // Minimum required Vitest test 8
  it("8: une tentative de sortie de PORTFOLIO_MEDIA_PATH est rejetée", async () => {
    // Invalid UUID with traversal attempt
    await expect(
      regeneratePhotoWatermark("../../etc/passwd", INITIAL_REV, { mediaBasePath: mediaPath })
    ).rejects.toThrow("Invalid photo ID.");
  });

  // Minimum required Vitest test 9
  it("9: un lien symbolique est rejeté", async () => {
    const originalPath = path.join(mediaPath, "global-v2", "photos", PHOTO_ID, "originals", `${FILE_ID}.jpeg`);
    const realFile = path.join(tempDir, "real.jpeg");
    fs.copyFileSync(originalPath, realFile);
    fs.unlinkSync(originalPath);
    fs.symlinkSync(realFile, originalPath);

    await expect(
      regeneratePhotoWatermark(PHOTO_ID, INITIAL_REV, { mediaBasePath: mediaPath })
    ).rejects.toThrow(SafeImageError);
  });

  // Minimum required Vitest test 10
  it("10: une erreur Sharp conserve les anciennes variantes", async () => {
    const variantPath = path.join(mediaPath, "global-v2", "photos", PHOTO_ID, "480p", `${FILE_ID}-480p.webp`);
    const oldVariantHash = getFileSha256(variantPath);

    // Corrupt the original file so sharp fails decoding
    const originalPath = path.join(mediaPath, "global-v2", "photos", PHOTO_ID, "originals", `${FILE_ID}.jpeg`);
    fs.writeFileSync(originalPath, Buffer.from("corrupted image content not a jpeg"));

    await expect(
      regeneratePhotoWatermark(PHOTO_ID, INITIAL_REV, { mediaBasePath: mediaPath })
    ).rejects.toThrow();

    // The old variant must remain unchanged
    const newVariantHash = getFileSha256(variantPath);
    expect(newVariantHash).toBe(oldVariantHash);
  });

  // Minimum required Vitest test 11
  it("11: une erreur d'écriture ou de sauvegarde JSON déclenche un rollback", async () => {
    const variantPath = path.join(mediaPath, "global-v2", "photos", PHOTO_ID, "480p", `${FILE_ID}-480p.webp`);
    const oldVariantContent = fs.readFileSync(variantPath);
    const jsonBefore = fs.readFileSync(contentPath, "utf-8");

    // Simulate JSON save failure
    await expect(
      regeneratePhotoWatermark(PHOTO_ID, INITIAL_REV, {
        mediaBasePath: mediaPath,
        onBeforeSavePortfolio: () => {
          throw new Error("Disk full while saving JSON");
        }
      })
    ).rejects.toThrow();

    // Verify rollback of variants
    const currentVariantContent = fs.readFileSync(variantPath);
    expect(currentVariantContent.equals(oldVariantContent)).toBe(true);

    // Verify JSON was not changed
    const jsonAfter = fs.readFileSync(contentPath, "utf-8");
    expect(jsonAfter).toBe(jsonBefore);
  });

  // Minimum required Vitest test 12
  it("12: aucun fichier temporaire ou de sauvegarde résiduel ne subsiste", async () => {
    // Run successful regeneration
    await regeneratePhotoWatermark(PHOTO_ID, INITIAL_REV, { mediaBasePath: mediaPath });

    function findResidualFiles(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findResidualFiles(fullPath));
        } else if (entry.name.startsWith(".tmp") || entry.name.startsWith(".bak")) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const residualFiles = findResidualFiles(mediaPath);
    expect(residualFiles).toHaveLength(0);
  });

  // Minimum required Vitest test 13
  it("13: les covers vidéo ne sont jamais modifiées", async () => {
    // Setup video cover in media dir
    const coverDir = path.join(mediaPath, "global-v2", "photos", "88888888-8888-4000-8000-888888888888", "480p");
    fs.mkdirSync(coverDir, { recursive: true, mode: 0o700 });
    const coverPath = path.join(coverDir, "11111111111111111111111111111111-480p.webp");
    fs.writeFileSync(coverPath, Buffer.from("untouched cover content"), { mode: 0o600 });
    const coverHashBefore = getFileSha256(coverPath);

    // Regenerate photo
    await regeneratePhotoWatermark(PHOTO_ID, INITIAL_REV, { mediaBasePath: mediaPath });

    // Video cover file is untouched
    const coverHashAfter = getFileSha256(coverPath);
    expect(coverHashAfter).toBe(coverHashBefore);

    // Video cover metadata in portfolio is untouched
    const portfolio = getPortfolioContent();
    expect(portfolio.video?.cover?.imageId).toBe("88888888-8888-4000-8000-888888888888");
  });

  // Minimum required Vitest test 14
  describe("14: contrôles session, CSRF, méthode, Content-Type et révision sur la route admin", () => {
    async function createRequest(
      body: Record<string, string>,
      method = "POST",
      options: {
        cookie?: string;
        contentType?: string;
        rawBody?: string;
      } = {}
    ) {
      const cookie = options.cookie !== undefined ? options.cookie : await createAdminCookie();
      const contentType = options.contentType !== undefined ? options.contentType : "application/x-www-form-urlencoded";

      let requestBody: string | undefined;
      if (method === "POST") {
        if (options.rawBody !== undefined) {
          requestBody = options.rawBody;
        } else {
          const params = new URLSearchParams();
          for (const [k, v] of Object.entries(body)) {
            params.append(k, v);
          }
          requestBody = params.toString();
        }
      }

      return new Request("https://example.com/admin/portfolio/watermark", {
        method,
        headers: {
          "Origin": "https://example.com",
          "Content-Type": contentType,
          ...(cookie ? { "Cookie": cookie } : {}),
        },
        body: requestBody,
      });
    }

    it("requiert une session administrateur valide (redirection /admin si sans session)", async () => {
      const req = await createRequest({ intent: "regenerate_one" }, "POST", { cookie: "" });
      await expect(action({ request: req } as Parameters<typeof action>[0])).rejects.toBeInstanceOf(Response);
    });

    it("rejette les requêtes non-POST sur action (405)", async () => {
      const req = await createRequest({}, "GET");
      const res = await action({ request: req } as Parameters<typeof action>[0]) as Response;
      expect(res.status).toBe(405);
    });

    it("rejette les requêtes avec CSRF manquant ou invalide (403)", async () => {
      const req = await createRequest({
        intent: "regenerate_one",
        csrfToken: "wrong-csrf-token",
        portfolioRevision: INITIAL_REV,
      });
      const res = await action({ request: req } as Parameters<typeof action>[0]) as Response;
      expect(res.status).toBe(403);
    });

    it("rejette un Content-Type non supporté (ex: application/json) (415)", async () => {
      const req = await createRequest(
        {},
        "POST",
        {
          contentType: "application/json",
          rawBody: JSON.stringify({ intent: "regenerate_one" }),
        }
      );
      const res = await action({ request: req } as Parameters<typeof action>[0]) as Response;
      expect(res.status).toBe(415);
    });

    it("rejette un conflit de révision (409)", async () => {
      const req = await createRequest({
        intent: "regenerate_one",
        csrfToken: "valid-csrf-token",
        portfolioRevision: "obsolete-revision-12345678901234",
      });
      const res = await action({ request: req } as Parameters<typeof action>[0]) as Response;
      expect(res.status).toBe(409);
    });

    it("action regenerate_one traite une photo obsolète et renvoie progression", async () => {
      const req = await createRequest({
        intent: "regenerate_one",
        csrfToken: "valid-csrf-token",
        portfolioRevision: INITIAL_REV,
      });
      const res = await action({ request: req } as Parameters<typeof action>[0]) as Response;
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.done).toBe(true);
      expect(data.outdatedPhotos).toBe(0);
      expect(data.upToDatePhotos).toBe(1);
      expect(data.totalPhotos).toBe(1);
      expect(data.processedPhotoId).toBe(PHOTO_ID);
      expect(data.portfolioRevision).not.toBe(INITIAL_REV);
    });

    it("loader renvoie les compteurs de photos total, à jour et obsolètes", async () => {
      const cookie = await createAdminCookie();
      const req = new Request("https://example.com/admin/portfolio/watermark", {
        headers: { "Cookie": cookie },
      });
      const res = await loader({ request: req } as Parameters<typeof loader>[0]) as Response;
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.totalPhotos).toBe(1);
      expect(data.upToDatePhotos).toBe(0);
      expect(data.outdatedPhotos).toBe(1);
      expect(data.watermarkText).toBe("Sempra Nouveau");
      expect(data.csrfToken).toBe("valid-csrf-token");
    });
  });

  // Minimum required Vitest test 15
  it("15: aucune donnée de production n'est utilisée", () => {
    expect(contentPath).toContain("timeless-regen-test-");
    expect(mediaPath).toContain("timeless-regen-test-");
    expect(contentPath).not.toContain("SempraData");
    expect(mediaPath).not.toContain("SempraData");
  });

  // Public cache busting tests
  describe("Cache busting public photos", () => {
    it("getPublicPhotoUrl et getPublicPhotoSrcSet incluent le paramètre ?v= quand version est définie", () => {
      const photo = {
        id: PHOTO_ID,
        categorySlug: "mariages",
        alt: { fr: "Fr", en: "En" },
        width: 800,
        height: 600,
        variants: [
          { name: "480p" as const, width: 480, height: 360 },
          { name: "960p" as const, width: 960, height: 720 },
        ],
        version: NEW_WM_REV,
      };

      const url = getPublicPhotoUrl(photo);
      expect(url).toBe(`/portfolio/media/${PHOTO_ID}/960p?v=${NEW_WM_REV}`);

      const srcset = getPublicPhotoSrcSet(photo);
      expect(srcset).toContain(`/portfolio/media/${PHOTO_ID}/480p?v=${NEW_WM_REV} 480w`);
      expect(srcset).toContain(`/portfolio/media/${PHOTO_ID}/960p?v=${NEW_WM_REV} 960w`);
    });

    it("getPublicPhotoUrl et getPublicPhotoSrcSet omettent le paramètre ?v= quand version est absente", () => {
      const photo = {
        id: PHOTO_ID,
        categorySlug: "mariages",
        alt: { fr: "Fr", en: "En" },
        width: 800,
        height: 600,
        variants: [
          { name: "480p" as const, width: 480, height: 360 },
        ],
      };

      const url = getPublicPhotoUrl(photo);
      expect(url).toBe(`/portfolio/media/${PHOTO_ID}/480p`);

      const srcset = getPublicPhotoSrcSet(photo);
      expect(srcset).toBe(`/portfolio/media/${PHOTO_ID}/480p 480w`);
    });
  });
});
