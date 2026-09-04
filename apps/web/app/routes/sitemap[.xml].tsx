/**
 * Resource route — /sitemap.xml
 *
 * Returns 503 when PUBLIC_SITE_URL is not configured (production misconfiguration).
 * Only public pages are included — private areas (gallery, client-area) are excluded.
 */
import { getPublishedProjects } from "../lib/portfolio-content.server";

export async function loader() {
  const siteUrl = process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";

  if (!siteUrl) {
    return new Response(
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!-- sitemap unavailable: PUBLIC_SITE_URL not configured -->",
      {
        status: 503,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Retry-After": "3600",
        },
      }
    );
  }

  const PUBLIC_ROUTES = [
    { loc: "/fr/", changefreq: "weekly", priority: "1.0" },
    { loc: "/en/", changefreq: "weekly", priority: "1.0" },
    { loc: "/fr/portfolio", changefreq: "monthly", priority: "0.8" },
    { loc: "/en/portfolio", changefreq: "monthly", priority: "0.8" },
    { loc: "/fr/formules", changefreq: "monthly", priority: "0.8" },
    { loc: "/en/pricing", changefreq: "monthly", priority: "0.8" },
    { loc: "/fr/a-propos", changefreq: "monthly", priority: "0.7" },
    { loc: "/en/about", changefreq: "monthly", priority: "0.7" },
    { loc: "/fr/contact", changefreq: "monthly", priority: "0.9" },
    { loc: "/en/contact", changefreq: "monthly", priority: "0.9" },
  ];

  let publishedProjects;
  try {
    publishedProjects = getPublishedProjects();
  } catch {
    return new Response(
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!-- sitemap temporarily unavailable -->",
      {
        status: 503,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Retry-After": "3600",
        },
      }
    );
  }

  const projectRoutes = publishedProjects.flatMap(project => [
    { loc: `/fr/portfolio/${project.slug.fr}`, changefreq: "monthly", priority: "0.7" },
    { loc: `/en/portfolio/${project.slug.en}`, changefreq: "monthly", priority: "0.7" },
  ]);

  const today = new Date().toISOString().split("T")[0];

  const urlEntries = [...PUBLIC_ROUTES, ...projectRoutes].map(
    ({ loc, changefreq, priority }) => `
  <url>
    <loc>${siteUrl}${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
  ).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">${urlEntries}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
