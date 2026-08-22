import { requireAdminSession, constantTimeEqual } from "./auth.server";

export class ActionSecurityError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ActionSecurityError";
    this.status = status;
  }
}

/**
 * Common helper for secure admin mutations (POST/PUT/DELETE)
 * Implements strict validations as per Phase 3B requirements.
 */
export async function requireSecureAdminMutation(request: Request) {
  // 1 & 2. Admin session validation (includes valid session checks + destroy invalid)
  // This will throw a redirect to /admin if invalid, properly destroying cookie.
  const { session } = await requireAdminSession(request);

  // Ensure it's a mutation
  if (request.method === "GET" || request.method === "HEAD") {
    throw new ActionSecurityError("Method not allowed for mutation", 405);
  }

  // 3. Strict Origin check
  const origin = request.headers.get("Origin");
  const host = request.headers.get("Host");
  const url = new URL(request.url);

  const expectedOrigin = process.env.PUBLIC_SITE_URL || url.origin;

  if (!origin || origin !== expectedOrigin) {
    // In local dev, localhost vs 127.0.0.1 can be tricky, but we strictly enforce PUBLIC_SITE_URL
    if (process.env.NODE_ENV === "production" || origin !== url.origin) {
       throw new ActionSecurityError(`Forbidden Origin. Expected ${expectedOrigin}, got ${origin}`, 403);
    }
  }

  // 5. Strict Content-Type validation
  const contentType = request.headers.get("Content-Type");
  if (!contentType || (
    !contentType.includes("application/x-www-form-urlencoded") &&
    !contentType.includes("multipart/form-data") &&
    !contentType.includes("application/json")
  )) {
    throw new ActionSecurityError("Unsupported Media Type", 415);
  }

  // 6. Body size limit (approximate via Content-Length header, and we will stream/parse below carefully)
  const contentLengthStr = request.headers.get("Content-Length");
  if (contentLengthStr) {
    const contentLength = parseInt(contentLengthStr, 10);
    // 500 KB max for content JSON/Forms
    if (contentLength > 500 * 1024) {
      throw new ActionSecurityError("Payload Too Large", 413);
    }
  }

  return { session }; // Successfully validated base security
}

export async function validateAdminFormData(request: Request) {
  const { session } = await requireSecureAdminMutation(request);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    throw new ActionSecurityError("Unprocessable Entity", 422);
  }

  // 4. CSRF Validation
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
  // 7. Systematic Cache-Control: no-store for admin pages
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return headers;
}
