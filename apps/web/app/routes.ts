import { type RouteConfig, index, route, prefix } from "@react-router/dev/routes";

export default [
  // ── Root redirect ─────────────────────────────────────────
  index("routes/root-redirect.tsx"),

  // ── System resource routes ────────────────────────────────
  // These MUST be declared here — files in routes/ are NOT auto-discovered
  route("robots.txt", "routes/robots[.txt].tsx"),
  route("sitemap.xml", "routes/sitemap[.xml].tsx"),
  route("maintenance", "routes/maintenance.tsx"),

  // ── French routes ─────────────────────────────────────────
  ...prefix("fr", [
    index("routes/fr._index.tsx"),
    route("portfolio", "routes/fr.portfolio.tsx"),
    route("formules", "routes/fr.formules.tsx"),
    route("a-propos", "routes/fr.about.tsx"),
    route("contact", "routes/fr.contact.tsx"),
    route("espace-clients", "routes/fr.clients.tsx"),
    route("galerie/:id", "routes/fr.gallery.tsx"),
    route("mentions-legales", "routes/fr.legal.tsx"),
    route("confidentialite", "routes/fr.privacy.tsx"),
    route("cgv", "routes/fr.cgv.tsx"),
  ]),

  // ── English routes ────────────────────────────────────────
  ...prefix("en", [
    index("routes/en._index.tsx"),
    route("portfolio", "routes/en.portfolio.tsx"),
    route("pricing", "routes/en.pricing.tsx"),
    route("about", "routes/en.about.tsx"),
    route("contact", "routes/en.contact.tsx"),
    route("client-area", "routes/en.clients.tsx"),
    route("gallery/:id", "routes/en.gallery.tsx"),
    route("legal", "routes/en.legal.tsx"),
    route("privacy", "routes/en.privacy.tsx"),
    route("terms", "routes/en.cgv.tsx"),
  ]),

  // ── Test routes (not in production) ───────────────────────
  ...(process.env.NODE_ENV !== "production" ? [
    route("__test/gallery", "routes/__test.gallery.tsx")
  ] : []),

  // ── Admin routes ──────────────────────────────────────────
  route("admin", "routes/admin.tsx"),
  route("admin/pricing", "routes/admin.pricing.tsx"),
  route("admin/settings", "routes/admin.settings.tsx"),
  route("admin/portfolio", "routes/admin.portfolio.tsx"),
  route("admin/portfolio/new", "routes/admin.portfolio.new.tsx"),
  route("admin/portfolio/:projectId", "routes/admin.portfolio.$projectId.tsx"),
  route("admin/portfolio/:projectId/preview", "routes/admin.portfolio.$projectId.preview.tsx"),

  // ── Catch-all (404) ───────────────────────────────────────
  route("*", "routes/404.tsx"),
] satisfies RouteConfig;
