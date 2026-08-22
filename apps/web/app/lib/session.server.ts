import { createCookieSessionStorage } from "react-router";
import { ENV } from "./env.server";

type SessionData = {
  adminId: string;
  credentialVersion: string;
  csrfToken: string;
};

type SessionFlashData = {
  error: string;
};

let _sessionStorage: ReturnType<typeof createCookieSessionStorage<SessionData, SessionFlashData>> | null = null;
let _cachedSecret: string | null = null;

function getSessionStorage() {
  const secret = ENV.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET is not configured.");
  }

  // Re-create if secret changed (e.g. rotation)
  if (_sessionStorage && _cachedSecret === secret) {
    return _sessionStorage;
  }

  _cachedSecret = secret;
  _sessionStorage = createCookieSessionStorage<SessionData, SessionFlashData>({
    cookie: {
      name: "__admin_session",
      httpOnly: true,
      maxAge: 8 * 60 * 60, // 8 hours
      path: "/",
      sameSite: "strict",
      secrets: [secret],
      secure: process.env.NODE_ENV === "production",
    },
  });
  return _sessionStorage;
}

export function getSession(cookie?: string | null) {
  return getSessionStorage().getSession(cookie);
}

export function commitSession(
  session: Awaited<ReturnType<typeof getSession>>
) {
  return getSessionStorage().commitSession(session);
}

export function destroySession(
  session: Awaited<ReturnType<typeof getSession>>
) {
  return getSessionStorage().destroySession(session);
}
