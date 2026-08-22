import { requireAdminSession, constantTimeEqual } from "./auth.server";
import { destroySession } from "./session.server";
import { redirect } from "react-router";
import { validateOrigin } from "./security.server";

export class ActionSecurityError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ActionSecurityError";
    this.status = status;
  }
}

/**
 * Validates the session and destroys it explicitly if invalid.
 */
export async function requireValidAdminSession(request: Request) {
  const { isValid, session } = await requireAdminSession(request);
  if (!isValid) {
    throw redirect("/admin", {
      headers: {
        "Set-Cookie": await destroySession(session),
      }
    });
  }
  return session;
}

const MAX_MUTATION_SIZE = 131072; // 128 KB exact

/**
 * Common helper for secure admin mutations (POST)
 * Implements strict validations as per Phase 3B requirements.
 */
export async function requireSecureAdminMutation(request: Request) {
  // 1 & 2. Strictly require valid session
  const session = await requireValidAdminSession(request);

  // Ensure it's a mutation
  if (request.method !== "POST") {
    const err = new ActionSecurityError("Method Not Allowed", 405);
    // Since ActionSecurityError doesn't carry headers naturally in this setup,
    // we can throw a Response if we strictly need `Allow: POST`, but requirements say
    // "si la structure de l'erreur le permet". So throwing the error is fine.
    throw err;
  }

  // 3. Strict Origin check
  if (!validateOrigin(request)) {
    throw new ActionSecurityError("Forbidden", 403);
  }

  // 4. Strict Content-Type validation
  const contentTypeRaw = request.headers.get("Content-Type");
  const contentType = contentTypeRaw ? contentTypeRaw.trim() : "";
  if (!/^application\/x-www-form-urlencoded(?:\s*;\s*charset\s*=\s*utf-8\s*)?$/i.test(contentType)) {
    throw new ActionSecurityError("Unsupported Media Type", 415);
  }

  // 5. Body size limit
  const contentLengthStr = request.headers.get("Content-Length");
  if (contentLengthStr) {
    if (!/^\d+$/.test(contentLengthStr)) {
      throw new ActionSecurityError("Invalid Content-Length", 400);
    }
    const contentLength = Number(contentLengthStr);
    if (!Number.isSafeInteger(contentLength)) {
      throw new ActionSecurityError("Invalid Content-Length", 400);
    }
    if (contentLength > MAX_MUTATION_SIZE) {
      throw new ActionSecurityError("Payload Too Large", 413);
    }
  }

  if (!request.body) {
    throw new ActionSecurityError("Bad Request", 400);
  }

  // Stream read to enforce 128KB limit exactly
  let totalBytes = 0;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_MUTATION_SIZE) {
          await reader.cancel("Payload too large");
          throw new ActionSecurityError("Payload Too Large", 413);
        }
        chunks.push(value);
      }
    }
  } catch (err: unknown) {
    if (err instanceof ActionSecurityError) throw err;
    throw new ActionSecurityError("Error reading request", 400);
  }

  const completeBody = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    completeBody.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const safeHeaders = new Headers();
  safeHeaders.set("Content-Type", contentType);

  const safeRequest = new Request(request.url, {
    method: request.method,
    headers: safeHeaders,
    body: completeBody,
  });

  return { session, safeRequest };
}

export async function validateAdminFormData(request: Request) {
  const { session, safeRequest } = await requireSecureAdminMutation(request);

  let formData: FormData;
  try {
    formData = await safeRequest.formData();
  } catch {
    throw new ActionSecurityError("Unprocessable Entity", 422);
  }

  // CSRF Validation
  const formCsrf = formData.get("csrfToken");
  if (typeof formCsrf !== "string") {
    throw new ActionSecurityError("CSRF Token missing", 403);
  }

  const sessionCsrf = session.get("csrfToken") ?? "";
  if (!formCsrf || !sessionCsrf || !constantTimeEqual(formCsrf, sessionCsrf)) {
    throw new ActionSecurityError("Invalid CSRF token", 403);
  }

  return formData;
}

export function createAdminHeaders(headers = new Headers()) {
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return headers;
}
