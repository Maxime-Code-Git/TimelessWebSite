import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getGalleryDb } from "./gallery-db.server";
import { ensureGalleryImportFolder, validateGalleryFolderConfinement } from "./gallery-folder.server";
import {
  countActiveSessionsForTarget,
  hasOngoingGalleryUploadFinalization,
  cleanupReceiptsForFile,
} from "./gallery-upload.server";

export type VideoSourceCategory = "root_videos" | "guest_videos" | "couple_videos";

export interface VideoCategoryConfig {
  id: VideoSourceCategory;
  relativePath: string;
  label: string;
}

export const VIDEO_CATEGORIES: Record<VideoSourceCategory, VideoCategoryConfig> = {
  root_videos: { id: "root_videos", relativePath: "videos", label: "Tous (invités et mariés)" },
  guest_videos: { id: "guest_videos", relativePath: path.join("invites", "videos"), label: "Invités" },
  couple_videos: { id: "couple_videos", relativePath: path.join("maries", "videos"), label: "Mariés" },
};

export interface GalleryVideoSource {
  name: string;
  category: VideoSourceCategory;
  categoryLabel: string;
  relativePath: string;
  size: number;
  version: string;
}

export class GalleryImportFileError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
    this.name = "GalleryImportFileError";
  }
}

function isSourceName(name: string): boolean {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    Buffer.byteLength(name) <= 255 &&
    !name.startsWith(".") &&
    !/[/\\\0\r\n]/.test(name) &&
    !name.endsWith(".part") &&
    !name.endsWith(".tmp")
  );
}

function fileVersion(folderName: string, category: string, name: string, stat: fs.BigIntStats): string {
  return createHash("sha256").update([
    folderName,
    category,
    name,
    stat.dev.toString(),
    stat.ino.toString(),
    stat.size.toString(),
    stat.mtimeNs.toString(),
    stat.ctimeNs.toString(),
  ].join("\0")).digest("hex");
}

export function listGalleryVideoSources(folderName: string): GalleryVideoSource[] {
  const { folderPath } = validateGalleryFolderConfinement(folderName);
  const sources: GalleryVideoSource[] = [];

  for (const catKey of Object.keys(VIDEO_CATEGORIES) as VideoSourceCategory[]) {
    const config = VIDEO_CATEGORIES[catKey];
    const catDir = path.join(folderPath, config.relativePath);
    if (!fs.existsSync(catDir)) continue;

    const dirStat = fs.lstatSync(catDir);
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) continue;

    for (const entry of fs.readdirSync(catDir, { withFileTypes: true })) {
      if (!entry.isFile() || !isSourceName(entry.name)) continue;
      const fullPath = path.join(catDir, entry.name);
      const stat = fs.lstatSync(fullPath, { bigint: true, throwIfNoEntry: false });
      if (!stat || !stat.isFile()) continue;

      sources.push({
        name: entry.name,
        category: config.id,
        categoryLabel: config.label,
        relativePath: config.relativePath,
        size: Number(stat.size),
        version: fileVersion(folderName, config.id, entry.name, stat),
      });
    }
  }

  return sources.sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
}

export function deleteGalleryVideoSource(
  galleryId: string,
  category: string,
  name: string,
  expectedVersion: string
): void {
  if (!isSourceName(name) || !/^[0-9a-f]{64}$/.test(expectedVersion)) {
    throw new GalleryImportFileError("Nom de fichier source ou confirmation invalide.", 400);
  }

  const categoryConfig = VIDEO_CATEGORIES[category as VideoSourceCategory];
  if (!categoryConfig) {
    throw new GalleryImportFileError("Catégorie d'emplacement vidéo invalide.", 400);
  }

  const folder = ensureGalleryImportFolder(galleryId);
  const db = getGalleryDb();

  const activeImport = db.prepare(`
    SELECT 1 FROM gallery_imports
    WHERE gallery_id = ? AND status IN ('pending', 'processing')
    LIMIT 1
  `).get(galleryId);

  if (
    activeImport ||
    countActiveSessionsForTarget(folder.folderPath, galleryId, "videos") > 0 ||
    hasOngoingGalleryUploadFinalization(galleryId)
  ) {
    throw new GalleryImportFileError("Un transfert ou un import est en cours pour cette galerie. Réessayez une fois terminé.", 409);
  }

  // Strict path confinement & symlink refusal
  const baseReal = fs.realpathSync(folder.folderPath);
  const subParts = categoryConfig.relativePath.split(path.sep).filter(Boolean);
  let current = baseReal;
  for (const part of subParts) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) {
      throw new GalleryImportFileError("Dossier introuvable.", 404);
    }
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new GalleryImportFileError("Lien symbolique détecté dans le chemin.", 400);
    }
  }

  const targetFilePath = path.join(current, name);
  const stat = fs.lstatSync(targetFilePath, { bigint: true, throwIfNoEntry: false });
  if (!stat || !stat.isFile()) {
    throw new GalleryImportFileError("Fichier introuvable dans le dossier vidéo sélectionné de cette galerie.", 404);
  }

  const currentVersion = fileVersion(folder.folderName, category, name, stat);
  if (currentVersion !== expectedVersion) {
    throw new GalleryImportFileError("Le fichier a été modifié ou remplacé depuis l'affichage. Rechargez la page.", 409);
  }

  // Delete the source file only
  fs.unlinkSync(targetFilePath);

  // Clean up any upload receipts for this file
  cleanupReceiptsForFile(folder.folderPath, name);
}
