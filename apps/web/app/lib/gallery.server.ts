import crypto from "node:crypto";
import { getGalleryDb } from "./gallery-db.server";
import { generateGalleryCode, hashGalleryCode, encryptGalleryCode } from "./gallery-auth.server";
import { addCalendarMonths } from "./date";

export interface Gallery {
  id: string;
  public_id: string;
  bride_names: string;
  wedding_date: string;
  location: string;
  intro_fr: string | null;
  intro_en: string | null;
  signature_fr: string | null;
  signature_en: string | null;
  created_at: number;
  expires_at: number;
  status: "draft" | "published" | "archived";
  guest_code_hash: string;
  couple_code_hash: string;
  guest_code_encrypted: string;
  couple_code_encrypted: string;
  guest_code_version: number;
  couple_code_version: number;
  cover_image_id: string | null;
  import_path: string | null;
}

export interface GalleryMediaRow {
  id: string;
  gallery_id: string;
  type: "photo" | "video";
  visibility: "invites" | "maries";
  sort_order: number;
  original_name: string;
  mime_type: string;
  size: number;
  hash: string;
  width: number | null;
  height: number | null;
  created_at: number;
}

export interface GalleryImportRow {
  id: string;
  gallery_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  total: number;
  result_json: string | null;
  created_at: number;
  updated_at: number;
}

export function getGalleries(): Gallery[] {
  const db = getGalleryDb();
  return db.prepare("SELECT * FROM galleries ORDER BY created_at DESC").all() as unknown as Gallery[];
}

export function getGalleryById(id: string): Gallery | undefined {
  const db = getGalleryDb();
  return db.prepare("SELECT * FROM galleries WHERE id = ?").get(id) as Gallery | undefined;
}

export function getGalleryByPublicId(publicId: string): Gallery | undefined {
  const db = getGalleryDb();
  return db.prepare("SELECT * FROM galleries WHERE public_id = ?").get(publicId) as Gallery | undefined;
}

export function getGalleryMedia(galleryId: string, accessLevel: "invites" | "maries") {
  const db = getGalleryDb();

  const visCondition = accessLevel === "maries" ? "" : " AND visibility = 'invites'";

  const videoQuery = "SELECT id, type, width, height, mime_type FROM gallery_media WHERE gallery_id = ? AND type = 'video'" + visCondition + " ORDER BY created_at ASC";
  const videos = db.prepare(videoQuery).all(galleryId) as unknown as GalleryMediaRow[];

  const photoQuery = "SELECT id, type, width, height, mime_type FROM gallery_media WHERE gallery_id = ? AND type = 'photo'" + visCondition + " ORDER BY created_at ASC LIMIT 24";
  const photos = db.prepare(photoQuery).all(galleryId) as unknown as GalleryMediaRow[];

  return [...videos, ...photos];
}

export function createGallery(data: {
  bride_names: string;
  wedding_date: string;
  location?: string;
  intro_fr?: string;
  intro_en?: string;
  signature_fr?: string;
  signature_en?: string;
  expires_at?: number;
}): Gallery {
  const db = getGalleryDb();
  const id = crypto.randomUUID();
  const public_id = crypto.randomUUID();

  let guestCode = generateGalleryCode();
  let coupleCode = generateGalleryCode();
  while (guestCode === coupleCode) coupleCode = generateGalleryCode();

  // Check collision in gallery_codes (the source of truth)
  let collision = true;
  let attempts = 0;
  while (collision && attempts < 10) {
    const guestHash = hashGalleryCode(guestCode);
    const coupleHash = hashGalleryCode(coupleCode);
    const existingCode = db.prepare(
      "SELECT code_hash FROM gallery_codes WHERE code_hash = ? OR code_hash = ?"
    ).get(guestHash, coupleHash);
    if (!existingCode) {
      collision = false;
    } else {
      guestCode = generateGalleryCode();
      coupleCode = generateGalleryCode();
      while (guestCode === coupleCode) coupleCode = generateGalleryCode();
    }
    attempts++;
  }
  if (collision) {
    throw new Error("Failed to generate unique gallery codes after 10 attempts");
  }

  const now = new Date();
  const expires_at = data.expires_at || addCalendarMonths(now, 24).getTime();
  const nowMs = now.getTime();

  db.exec("BEGIN EXCLUSIVE TRANSACTION;");
  try {
    const guestHash = hashGalleryCode(guestCode);
    const coupleHash = hashGalleryCode(coupleCode);

    db.prepare(`
      INSERT INTO galleries (
        id, public_id, bride_names, wedding_date, location,
        intro_fr, intro_en, signature_fr, signature_en,
        created_at, expires_at, status,
        guest_code_hash, couple_code_hash, guest_code_encrypted, couple_code_encrypted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
    `).run(
      id, public_id, data.bride_names, data.wedding_date, data.location || null,
      data.intro_fr || null, data.intro_en || null, data.signature_fr || null, data.signature_en || null,
      nowMs, expires_at,
      guestHash, coupleHash,
      encryptGalleryCode(guestCode), encryptGalleryCode(coupleCode)
    );

    db.prepare("INSERT INTO gallery_codes (code_hash, gallery_id, level, version, created_at) VALUES (?, ?, ?, ?, ?)").run(guestHash, id, "invites", 1, nowMs);
    db.prepare("INSERT INTO gallery_codes (code_hash, gallery_id, level, version, created_at) VALUES (?, ?, ?, ?, ?)").run(coupleHash, id, "maries", 1, nowMs);

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return getGalleryById(id)!;
}

export function updateGallery(id: string, data: Partial<Gallery>) {
  const db = getGalleryDb();
  const gallery = getGalleryById(id);
  if (!gallery) throw new Error("Gallery not found");

  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  const whitelist = ["bride_names", "wedding_date", "location", "intro_fr", "intro_en", "signature_fr", "signature_en", "expires_at", "status", "cover_image_id"];

  for (const key of whitelist) {
    if (key in data) {
      fields.push(`${key} = ?`);
      values.push((data as Record<string, string | number | null>)[key]);
    }
  }

  if (fields.length === 0) return gallery;

  values.push(id);
  db.prepare(`UPDATE galleries SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  return getGalleryById(id)!;
}

export class CodeCollisionError extends Error {
  readonly status = 409;
  constructor(message = "Code collision") {
    super(message);
    this.name = "CodeCollisionError";
  }
}

/**
 * Rotate a single level's code. Pass exactly one of guestCodeStr or coupleCodeStr.
 * For rotating both independently, call twice.
 */
export function rotateGalleryCode(id: string, level: "invites" | "maries", newCodeStr: string): void {
  const db = getGalleryDb();
  const gallery = getGalleryById(id);
  if (!gallery) throw new Error("Gallery not found");

  const newHash = hashGalleryCode(newCodeStr);
  const isGuest = level === "invites";

  const currentVersion = isGuest ? gallery.guest_code_version : gallery.couple_code_version;
  const newVersion = currentVersion + 1;

  db.exec("BEGIN EXCLUSIVE TRANSACTION;");
  try {
    // Check for collision in gallery_codes
    const collision = db.prepare(
      "SELECT gallery_id, level FROM gallery_codes WHERE code_hash = ?"
    ).get(newHash) as { gallery_id: string; level: string } | undefined;

    if (collision) {
      throw new CodeCollisionError();
    }

    // Delete old code for this level
    db.prepare("DELETE FROM gallery_codes WHERE gallery_id = ? AND level = ?").run(id, level);

    // Insert new code
    db.prepare(
      "INSERT INTO gallery_codes (code_hash, gallery_id, level, version, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(newHash, id, level, newVersion, Date.now());

    // Update galleries table
    if (isGuest) {
      db.prepare(
        "UPDATE galleries SET guest_code_hash = ?, guest_code_encrypted = ?, guest_code_version = ? WHERE id = ?"
      ).run(newHash, encryptGalleryCode(newCodeStr), newVersion, id);
    } else {
      db.prepare(
        "UPDATE galleries SET couple_code_hash = ?, couple_code_encrypted = ?, couple_code_version = ? WHERE id = ?"
      ).run(newHash, encryptGalleryCode(newCodeStr), newVersion, id);
    }

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

/**
 * @deprecated Use rotateGalleryCode for independent rotation
 */
export function rotateGalleryCodes(id: string, guestCodeStr?: string, coupleCodeStr?: string): void {
  if (guestCodeStr) rotateGalleryCode(id, "invites", guestCodeStr);
  if (coupleCodeStr) rotateGalleryCode(id, "maries", coupleCodeStr);
}

export function getGalleryMediaStats(id: string) {
  const db = getGalleryDb();
  const invitesPhotos = (db.prepare("SELECT COUNT(*) as c FROM gallery_media WHERE gallery_id = ? AND visibility = 'invites' AND type = 'photo'").get(id) as { c: number }).c;
  const invitesVideos = (db.prepare("SELECT COUNT(*) as c FROM gallery_media WHERE gallery_id = ? AND visibility = 'invites' AND type = 'video'").get(id) as { c: number }).c;
  const mariesPhotos = (db.prepare("SELECT COUNT(*) as c FROM gallery_media WHERE gallery_id = ? AND visibility = 'maries' AND type = 'photo'").get(id) as { c: number }).c;
  const mariesVideos = (db.prepare("SELECT COUNT(*) as c FROM gallery_media WHERE gallery_id = ? AND visibility = 'maries' AND type = 'video'").get(id) as { c: number }).c;

  return { invitesPhotos, invitesVideos, mariesPhotos, mariesVideos };
}

export function getGalleryImports(galleryId: string): GalleryImportRow[] {
  const db = getGalleryDb();
  return db.prepare("SELECT * FROM gallery_imports WHERE gallery_id = ? ORDER BY created_at DESC").all(galleryId) as unknown as GalleryImportRow[];
}
