import { verify } from "@node-rs/argon2";
import crypto from "node:crypto";
import { ENV } from "./env.server";
import { getSession } from "./session.server";
import { redirect } from "react-router";

export async function verifyAdminPassword(password: string): Promise<boolean> {
  if (!password || !ENV.ADMIN_PASSWORD_HASH) return false;
  try {
    return await verify(ENV.ADMIN_PASSWORD_HASH, password);
  } catch {
    return false;
  }
}

/**
 * Derives an opaque credential version from the full password hash
 * using HMAC-SHA256 keyed with the session secret.
 *
 * Changing either ADMIN_PASSWORD_HASH or ADMIN_SESSION_SECRET
 * invalidates every existing session.
 */
export function computeCredentialVersion(): string {
  const hash = ENV.ADMIN_PASSWORD_HASH;
  const secret = ENV.ADMIN_SESSION_SECRET;
  if (!hash || !secret) {
    throw new Error("Admin configuration is incomplete.");
  }
  return crypto
    .createHmac("sha256", secret)
    .update(hash)
    .digest("base64url")
    .slice(0, 32);
}

export async function requireAdminSession(request: Request) {
  const cookie = request.headers.get("Cookie");
  const session = await getSession(cookie);

  if (!ENV.ADMIN_PASSWORD_HASH || !ENV.ADMIN_SESSION_SECRET) {
    throw redirect("/admin");
  }

  const expected = computeCredentialVersion();
  const actual = session.get("credentialVersion") ?? "";

  if (
    !session.has("adminId") ||
    !constantTimeEqual(actual, expected)
  ) {
    throw redirect("/admin");
  }

  return session;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}
