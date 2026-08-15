/**
 * Resource route — /robots.txt
 *
 * Dynamic route required because PUBLIC_SITE_URL is a server-side environment
 * variable and cannot be embedded into a static file.
 * The Sitemap: directive is omitted when PUBLIC_SITE_URL is not configured.
 */
export async function loader() {
  const siteUrl = process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";

  const lines = [
    "User-agent: *",
    "Allow: /",
    "",
    // Private areas — crawlers must not index
    "Disallow: /fr/espace-clients",
    "Disallow: /en/client-area",
    "Disallow: /fr/galerie/",
    "Disallow: /en/gallery/",
    "Disallow: /maintenance",
  ];

  if (siteUrl) {
    lines.push("");
    lines.push(`Sitemap: ${siteUrl}/sitemap.xml`);
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
