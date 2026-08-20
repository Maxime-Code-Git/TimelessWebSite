/**
 * Custom entry.server.tsx — required for:
 * 1. Nonce-based Content-Security-Policy (one nonce per response)
 * 2. Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
 *
 * NOTE: HSTS is intentionally EXCLUDED here.
 *   - HSTS requires validated HTTPS on all subdomains before activation.
 *   - Activate after TLS is fully configured on the Mac mini host.
 *   - Do NOT add preload until the domain is submitted to the HSTS preload list.
 */

import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import type { EntryContext } from "react-router";
import crypto from "node:crypto";

const ABORT_DELAY = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: Record<string, unknown>
) {
  return isbot(request.headers.get("user-agent") ?? "")
    ? handleBotRequest(request, responseStatusCode, responseHeaders, routerContext)
    : handleBrowserRequest(request, responseStatusCode, responseHeaders, routerContext);
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString("base64");
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  
  const styleSrc = isDev ? "'self' 'unsafe-inline'" : "'self'";
  const connectSrc = isDev ? "'self' ws: wss:" : "'self'";

  const directives = [
    "default-src 'self'",
    // React Router hydration scripts require nonce
    `script-src 'self' 'nonce-${nonce}'`,
    // CSS Modules compile to separate .css files — no inline styles needed in production
    `style-src ${styleSrc}`,
    // Local fonts only (woff2 served from /public/fonts/)
    "font-src 'self'",
    // Images from same origin + data: URIs (for base64 inline images if any)
    "img-src 'self' data:",
    // API calls will only go to same origin in Phase 3
    `connect-src ${connectSrc}`,
    // No iframes allowed
    "frame-ancestors 'none'",
    // Prevent base tag injection
    "base-uri 'self'",
    // Form submissions only to same origin
    "form-action 'self'",
    // No plugins
    "object-src 'none'",
  ];
  return directives.join("; ");
}

function addSecurityHeaders(headers: Headers, nonce: string): void {
  // CSP with nonce — regenerated per response (no replay attacks)
  headers.set("Content-Security-Policy", buildCsp(nonce));

  // Prevent MIME sniffing
  headers.set("X-Content-Type-Options", "nosniff");

  // Block embedding in iframes (defense-in-depth alongside frame-ancestors CSP)
  headers.set("X-Frame-Options", "DENY");

  // Control referrer information
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Disable browser features not used by this site
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  // HSTS intentionally omitted until HTTPS is confirmed on the host.
  // See comment at top of this file.
}

function handleBotRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext
) {
  return new Promise<Response>((resolve, reject) => {
    const nonce = generateNonce();
    let shellRendered = false;

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
      {
        nonce,
        onAllReady() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          addSecurityHeaders(responseHeaders, nonce);
          responseHeaders.set("Content-Type", "text/html; charset=utf-8");

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        },
      }
    );

    setTimeout(abort, ABORT_DELAY);
  });
}

function handleBrowserRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext
) {
  return new Promise<Response>((resolve, reject) => {
    const nonce = generateNonce();
    let shellRendered = false;

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
      {
        nonce,
        onShellReady() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          addSecurityHeaders(responseHeaders, nonce);
          responseHeaders.set("Content-Type", "text/html; charset=utf-8");

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        },
      }
    );

    setTimeout(abort, ABORT_DELAY);
  });
}
