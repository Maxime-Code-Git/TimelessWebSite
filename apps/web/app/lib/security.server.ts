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

/**
 * Extracts the real client IP address from the request.
 * SECURITY: When TRUST_PROXY is true, the application MUST run behind a trusted
 * reverse proxy (like Cloudflare or an internal API gateway) that strictly enforces
 * CF-Connecting-IP and/or X-Forwarded-For. Direct access to the origin must be blocked.
 */
export function getClientIp(request: Request): string | null {
  if (ENV.TRUST_PROXY) {
    let ip = request.headers.get("cf-connecting-ip");

    if (!ip) {
      ip = request.headers.get("x-forwarded-for");
    }

    if (!ip) {
      return null;
    }

    // Reject if multiple IPs (comma) indicating spoofing or multiple uncontrolled proxies
    if (ip.includes(",") || !ip.trim()) {
      return null;
    }
    const cleanIp = ip.trim();

    // Strict IP validation using net.isIP
    if (!net.isIP(cleanIp)) {
      return null;
    }
    return cleanIp;
  }
  return "127.0.0.1";
}

export async function readStrictFormUrlEncoded(request: Request, maxBytes: number = 500): Promise<URLSearchParams> {
  const contentTypeRaw = request.headers.get("Content-Type");
  const contentType = contentTypeRaw ? contentTypeRaw.trim() : "";
  if (!/^application\/x-www-form-urlencoded(?:\s*;\s*charset\s*=\s*utf-8\s*)?$/i.test(contentType)) {
    throw new Error("Unsupported Media Type: " + contentType);
  }

  if (!request.body) {
    throw new Error("Empty body");
  }

  const reader = request.body.getReader();
  let bytesRead = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        // Cancel the stream
        reader.cancel();
        throw new Error("Payload Too Large");
      }
      chunks.push(value);
    }
  }

  const totalBuffer = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    totalBuffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(totalBuffer);
  return new URLSearchParams(text);
}
