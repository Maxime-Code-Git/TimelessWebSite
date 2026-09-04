/**
 * Server-only module — do NOT import from client components.
 * Filename ends in .server.ts to enforce server-only usage with React Router.
 *
 * Reads PUBLIC_SITE_URL from environment variables.
 * In production, this MUST be set — canonical, hreflang, OG and sitemap depend on it.
 * Example: PUBLIC_SITE_URL=https://sempra.be
 */

let _warned = false;

export function getSiteUrl(): string {
  const url = process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";

  if (!url && process.env.NODE_ENV === "production" && !_warned) {
    _warned = true;
    console.error(
      "[CRITICAL] PUBLIC_SITE_URL is not set. " +
        "Canonical tags, hreflang, Open Graph URLs and sitemap will be omitted. " +
        "Set PUBLIC_SITE_URL in your environment before deploying."
    );
  }

  return url;
}

/**
 * Build a full absolute URL for a given path.
 * Returns empty string if PUBLIC_SITE_URL is not configured.
 */
export function siteUrl(path: string): string {
  const base = getSiteUrl();
  if (!base) return "";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
