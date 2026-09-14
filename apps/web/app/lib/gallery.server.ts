import crypto from "node:crypto";
import { getGalleryDb } from "./gallery-db.server";
import { generateGalleryCode, encryptGalleryCode, hashGalleryCode } from "./gallery-auth.server";

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

export function getGalleries(): Gallery[] {
  const db = getGalleryDb();
  return db.prepare("SELECT * FROM galleries ORDER BY created_at DESC").all() as unknown as Gallery[];
}

export function getGalleryById(id: string): Gallery | undefined {
  const db = getGalleryDb();
  return db.prepare("SELECT * FROM galleries WHERE id = ?").get(id) as unknown as Gallery | undefined;
}

export function getGalleryByPublicId(publicId: string): Gallery | undefined {
  const db = getGalleryDb();
  return db.prepare("SELECT * FROM galleries WHERE public_id = ?").get(publicId) as unknown as Gallery | undefined;
}

export function getGalleryMedia(galleryId: string, accessLevel: "invites" | "maries") {
  const db = getGalleryDb();
  if (accessLevel === "maries") {
    return db.prepare("SELECT id, type, width, height, mime_type FROM gallery_media WHERE gallery_id = ? ORDER BY created_at ASC").all(galleryId) as Record<string, unknown>[];
  } else {
    return db.prepare("SELECT id, type, width, height, mime_type FROM gallery_media WHERE gallery_id = ? AND visibility = 'invites' ORDER BY created_at ASC").all(galleryId) as Record<string, unknown>[];
  }
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
  // We use a non-predictable UUID for public_id to avoid enumeration
  const public_id = crypto.randomUUID();

  let guestCode = generateGalleryCode();
  let coupleCode = generateGalleryCode();

  // Ensure they are different
  while (guestCode === coupleCode) coupleCode = generateGalleryCode();

  // Check collision in db (very unlikely but required)
  let collision = true;
  while (collision) {
    const check = db.prepare("SELECT id FROM galleries WHERE guest_code_hash = ? OR couple_code_hash = ? OR guest_code_hash = ? OR couple_code_hash = ?")
      .get(hashGalleryCode(guestCode), hashGalleryCode(guestCode), hashGalleryCode(coupleCode), hashGalleryCode(coupleCode));
    if (!check) {
      collision = false;
    } else {
      guestCode = generateGalleryCode();
      coupleCode = generateGalleryCode();
      while (guestCode === coupleCode) coupleCode = generateGalleryCode();
    }
  }

  const now = new Date();
  const future = new Date(now);
  future.setMonth(future.getMonth() + 24);
  const expires_at = data.expires_at || future.getTime();

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

    db.prepare("INSERT INTO gallery_codes (code_hash, gallery_id, level, version, created_at) VALUES (?, ?, ?, ?, ?)").run(guestHash, id, 'invites', 1, nowMs);
    db.prepare("INSERT INTO gallery_codes (code_hash, gallery_id, level, version, created_at) VALUES (?, ?, ?, ?, ?)").run(coupleHash, id, 'maries', 1, nowMs);

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

  const whitelist = ['bride_names', 'wedding_date', 'location', 'intro_fr', 'intro_en', 'signature_fr', 'signature_en', 'expires_at', 'status', 'cover_image_id'];

  for (const key of whitelist) {
    if (key in data) {
      fields.push(`${key} = ?`);
      values.push((data as Record<string, unknown>)[key] as string | number | null);
    }
  }

  if (fields.length === 0) return gallery;

  values.push(id);
  db.prepare(`UPDATE galleries SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  return getGalleryById(id)!;
}

export function rotateGalleryCodes(id: string, guestCodeStr?: string, coupleCodeStr?: string) {
  const db = getGalleryDb();
  const gallery = getGalleryById(id);
  if (!gallery) throw new Error("Gallery not found");

  const updates: string[] = [];
  const values: Array<string | number | null> = [];

  const nowMs = Date.now();

  db.exec("BEGIN EXCLUSIVE TRANSACTION;");
  try {
    if (guestCodeStr) {
      const gHash = hashGalleryCode(guestCodeStr);
      updates.push("guest_code_hash = ?", "guest_code_encrypted = ?", "guest_code_version = guest_code_version + 1");
      values.push(gHash, encryptGalleryCode(guestCodeStr));
      db.prepare("INSERT INTO gallery_codes (code_hash, gallery_id, level, version, created_at) VALUES (?, ?, ?, guest_code_version + 1, ?)").run(gHash, id, 'invites', nowMs);
    }

    if (coupleCodeStr) {
      const cHash = hashGalleryCode(coupleCodeStr);
      updates.push("couple_code_hash = ?", "couple_code_encrypted = ?", "couple_code_version = couple_code_version + 1");
      values.push(cHash, encryptGalleryCode(coupleCodeStr));
      db.prepare("INSERT INTO gallery_codes (code_hash, gallery_id, level, version, created_at) VALUES (?, ?, ?, couple_code_version + 1, ?)").run(cHash, id, 'maries', nowMs);
    }

    if (updates.length > 0) {
      values.push(id);
      db.prepare(`UPDATE galleries SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    }

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function getGalleryMediaStats(id: string) {
  const db = getGalleryDb();
  const invitesPhotos = (db.prepare("SELECT COUNT(*) as c FROM gallery_media WHERE gallery_id = ? AND visibility = 'invites' AND type = 'photo'").get(id) as { c: number }).c;
  const invitesVideos = (db.prepare("SELECT COUNT(*) as c FROM gallery_media WHERE gallery_id = ? AND visibility = 'invites' AND type = 'video'").get(id) as { c: number }).c;
  const mariesPhotos = (db.prepare("SELECT COUNT(*) as c FROM gallery_media WHERE gallery_id = ? AND visibility = 'maries' AND type = 'photo'").get(id) as { c: number }).c;
  const mariesVideos = (db.prepare("SELECT COUNT(*) as c FROM gallery_media WHERE gallery_id = ? AND visibility = 'maries' AND type = 'video'").get(id) as { c: number }).c;

  return { invitesPhotos, invitesVideos, mariesPhotos, mariesVideos };
}

export function getGalleryImports(galleryId: string) {
  const db = getGalleryDb();
  return db.prepare("SELECT * FROM gallery_imports WHERE gallery_id = ? ORDER BY created_at DESC").all(galleryId);
}
