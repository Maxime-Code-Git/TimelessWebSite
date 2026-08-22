import * as net from "node:net";
import { ENV } from "./env.server";

export function validateOrigin(request: Request): boolean {
  const originHeader = request.headers.get("Origin");
  if (!originHeader) {
    return false;
  }
  try {
    const isValid = new URL(originHeader).origin === new URL(ENV.PUBLIC_SITE_URL).origin;
    return isValid;
  } catch {
    return false;
  }
}

export function getClientIp(request: Request): string | null {
  if (ENV.TRUST_PROXY) {
    const forwardedFor = request.headers.get("x-forwarded-for") || "";
    // Reject if multiple IPs (comma) indicating spoofing or multiple uncontrolled proxies
    if (forwardedFor.includes(",") || !forwardedFor.trim()) {
      return null;
    }
    const ip = forwardedFor.trim();
    // Strict IP validation using net.isIP
    if (!net.isIP(ip)) {
      return null;
    }
    return ip;
  }
  return "127.0.0.1";
}
