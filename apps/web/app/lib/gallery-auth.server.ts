import crypto from "node:crypto";
import { ENV } from "./env.server";
import { createCookieSessionStorage } from "react-router";
import { getClientIp } from "./security.server";
import { checkRateLimit, resetRateLimit } from "./rate-limit.server";
import { getGalleryDb } from "./gallery-db.server";
import { redirect } from "react-router";

// Derive keys from GALLERY_SECRET
const MASTER_SECRET = Buffer.from(ENV.GALLERY_SECRET, "hex");
if (MASTER_SECRET.length < 32) {
  throw new Error("CRITICAL: GALLERY_SECRET must be a hex string of at least 32 bytes (64 characters).");
}

const HMAC_KEY = Buffer.from(crypto.hkdfSync("sha256", MASTER_SECRET, Buffer.alloc(0), "gallery-hmac-key", 32));
const AES_KEY = Buffer.from(crypto.hkdfSync("sha256", MASTER_SECRET, Buffer.alloc(0), "gallery-aes-key", 32));
const SESSION_SECRET = Buffer.from(crypto.hkdfSync("sha256", MASTER_SECRET, Buffer.alloc(0), "gallery-session-key", 32)).toString("base64");

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, "");
}

// HMAC for deterministic search — normalizes (strips dashes, uppercases)
export function hashGalleryCode(code: string): string {
  return crypto.createHmac("sha256", HMAC_KEY).update(normalizeCode(code)).digest("hex");
}

// AES-256-GCM for encryption — preserves original formatting with dashes
export function encryptGalleryCode(code: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", AES_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`;
}

export function decryptGalleryCode(encryptedStr: string): string {
  const parts = encryptedStr.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");
  const [ivHex, encryptedHex, authTagHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", AES_KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function generateGalleryCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude ambiguous I, O, 0, 1
  let code = "SEMPRA-";
  for (let i = 0; i < 4; i++) code += chars[crypto.randomInt(0, chars.length)];
  code += "-";
  for (let i = 0; i < 4; i++) code += chars[crypto.randomInt(0, chars.length)];
  return code;
}

export const gallerySessionStorage = createCookieSessionStorage({
  cookie: {
    name: "sempra_gallery_session",
    secure: process.env.NODE_ENV === "production",
    secrets: [SESSION_SECRET],
    sameSite: "lax",
    path: "/",
    httpOnly: true,
  }
});

export type GalleryAccessLevel = "invites" | "maries";

export async function getGallerySession(request: Request) {
  const cookie = request.headers.get("Cookie");
  return gallerySessionStorage.getSession(cookie);
}

export function createCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

import type { Session } from "react-router";

export function verifyCsrfToken(session: Session, token: string | null): boolean {
  if (!token || typeof token !== "string" || token.length !== 64 || !/^[0-9a-f]{64}$/i.test(token)) return false;
  const stored = session.get("csrf") as string | undefined;
  if (!stored || typeof stored !== "string" || stored.length !== 64 || !/^[0-9a-f]{64}$/i.test(stored)) return false;
  return crypto.timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(stored, "hex"));
}

export async function loginGalleryClient(request: Request, formData: URLSearchParams, lang: "fr" | "en") {
  const ip = getClientIp(request);
  if (!ip) throw new Response("Forbidden", { status: 403 });

  const session = await getGallerySession(request);
  const csrfToken = formData.get("csrf");
  if (!verifyCsrfToken(session, csrfToken)) {
    throw new Response("Invalid CSRF token", { status: 403 });
  }

  const code = formData.get("code");
  if (!code || typeof code !== "string" || code.length > 50) {
    return Response.json({ error: lang === "fr" ? "Code invalide ou galerie indisponible." : "Invalid code or unavailable gallery." }, { status: 400 });
  }

  try {
    checkRateLimit(ip, "gallery");
  } catch {
    return Response.json({ error: lang === "fr" ? "Trop de tentatives. Veuillez réessayer plus tard." : "Too many attempts. Please try again later." }, { status: 429 });
  }

  const db = getGalleryDb();
  const hash = hashGalleryCode(code);

  const codeRow = db.prepare("SELECT gallery_id, level, version FROM gallery_codes WHERE code_hash = ?").get(hash) as { gallery_id: string; level: string; version: number } | undefined;
  if (!codeRow) {
    return Response.json({ error: lang === "fr" ? "Code invalide ou galerie indisponible." : "Invalid code or unavailable gallery." }, { status: 401 });
  }

  const gallery = db.prepare("SELECT * FROM galleries WHERE id = ?").get(codeRow.gallery_id) as { id: string; status: string; expires_at: number; public_id: string } | undefined;

  if (!gallery || gallery.status !== "published" || gallery.expires_at < Date.now()) {
    return Response.json({ error: lang === "fr" ? "Code invalide ou galerie indisponible." : "Invalid code or unavailable gallery." }, { status: 401 });
  }

  const accessLevel: GalleryAccessLevel = codeRow.level as GalleryAccessLevel;
  const version = codeRow.version;

  resetRateLimit(ip, "gallery");

  session.set("galleryId", gallery.id);
  session.set("accessLevel", accessLevel);
  session.set("codeVersion", version);
  // Re-generate CSRF for new session
  session.set("csrf", createCsrfToken());

  return redirect(`/${lang}/${lang === "fr" ? "galerie" : "gallery"}/${gallery.public_id}`, {
    headers: {
      "Set-Cookie": await gallerySessionStorage.commitSession(session),
      "Cache-Control": "no-store"
    }
  });
}

export const GALLERY_PRIVATE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff"
};

export async function requireGalleryAccess(request: Request, publicId: string, requiredMediaId?: string, isApi = false) {

  const { requireAdminSession } = await import("./auth.server");

  const { isValid: isAdmin } = await requireAdminSession(request);

  if (isAdmin) {
    // Admin bypass: Admin can view any media in any gallery
    const db = getGalleryDb();
    const gallery = db.prepare("SELECT * FROM galleries WHERE public_id = ?").get(publicId) as Record<string, unknown> | undefined;
    if (!gallery) {
      if (isApi) throw new Response("Unauthorized", { status: 401, headers: GALLERY_PRIVATE_HEADERS });
      throw redirect("/fr/espace-clients", { headers: GALLERY_PRIVATE_HEADERS });
    }

    let media = null;
    if (requiredMediaId) {
      media = db.prepare("SELECT * FROM gallery_media WHERE id = ? AND gallery_id = ?").get(requiredMediaId, gallery.id as string) as Record<string, unknown> | undefined;
      if (!media) throw new Response("Not found", { status: 404, headers: GALLERY_PRIVATE_HEADERS });
    }

    return { gallery, accessLevel: "maries" as GalleryAccessLevel, codeVersion: 0, media };
  }

  const session = await getGallerySession(request);
  const galleryId = session.get("galleryId") as string | undefined;
  const accessLevel = session.get("accessLevel") as GalleryAccessLevel | undefined;
  const codeVersion = session.get("codeVersion") as number | undefined;

  const unauthorized = () => {
    if (isApi) return new Response("Unauthorized", { status: 401, headers: GALLERY_PRIVATE_HEADERS });
    return redirect("/fr/espace-clients", { headers: GALLERY_PRIVATE_HEADERS });
  };

  if (!galleryId || !accessLevel || codeVersion === undefined) {
    throw unauthorized();
  }

  const db = getGalleryDb();
  // Fetch current code version from gallery_codes since it's the source of truth
  const codeRow = db.prepare("SELECT version FROM gallery_codes WHERE gallery_id = ? AND level = ?").get(galleryId as string, accessLevel as string) as { version: number } | undefined;
  if (!codeRow || codeRow.version !== codeVersion) {
    throw unauthorized();
  }

  const gallery = db.prepare("SELECT * FROM galleries WHERE public_id = ?").get(publicId) as Record<string, unknown> | undefined;
  if (!gallery || gallery.id !== galleryId || gallery.status !== "published" || (gallery.expires_at as number) < Date.now()) {
    throw unauthorized();
  }

  let media = null;
  if (requiredMediaId) {
    media = db.prepare("SELECT * FROM gallery_media WHERE id = ? AND gallery_id = ?").get(requiredMediaId, galleryId) as Record<string, unknown> | undefined;
    if (!media) throw new Response("Not found", { status: 404, headers: GALLERY_PRIVATE_HEADERS });
    if (media.visibility === "maries" && accessLevel === "invites") {
      throw new Response("Not found", { status: 404, headers: GALLERY_PRIVATE_HEADERS });
    }
  }

  return { gallery, accessLevel, codeVersion, media };
}
