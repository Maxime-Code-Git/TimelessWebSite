import { type RouteConfig, index, route, prefix } from "@react-router/dev/routes";

export default [
  // ── Root redirect ─────────────────────────────────────────
  index("routes/root-redirect.tsx"),

  // ── System resource routes ────────────────────────────────
  // These MUST be declared here — files in routes/ are NOT auto-discovered
  route("robots.txt", "routes/robots[.txt].tsx"),
  route("sitemap.xml", "routes/sitemap[.xml].tsx"),
  route("maintenance", "routes/maintenance.tsx"),
  route("api/booking", "routes/api.booking.ts"),
  route("api/admin/home-image", "routes/api.admin.home-image.ts"),
  route("api/admin/portfolio-video-cover", "routes/api.admin.portfolio-video-cover.ts"),
  route("portfolio/media/:photoId/:variant", "routes/portfolio.media.$photoId.$variant.tsx"),
  route("portfolio/video-cover/:photoId/:variant/:ext", "routes/portfolio.video-cover.$photoId.$variant.$ext.ts"),
  route("media/home/:section/:imageId/:variant/:ext", "routes/media.home.$section.$imageId.$variant.$ext.tsx"),
  route("api/gallery/:publicId/media/:mediaId", "routes/api.gallery.$publicId.media.$mediaId.ts"),
  route("api/gallery/:publicId/media/:mediaId/poster", "routes/api.gallery.$publicId.media.$mediaId.poster.ts"),
  route("api/gallery/:publicId/download", "routes/api.gallery.$publicId.download.ts"),
  route("api/gallery/:publicId/download/original/:mediaId", "routes/api.gallery.$publicId.download.original.$mediaId.ts"),
  route("api/gallery/:publicId/photos", "routes/api.gallery.$publicId.photos.ts"),
  route("api/admin/gallery-import/:id", "routes/api.admin.gallery-import.$id.ts"),
  route("api/admin/gallery/:id/media/:mediaId/poster", "routes/api.admin.gallery.$id.media.$mediaId.poster.ts"),

  // ── French routes ─────────────────────────────────────────
  ...prefix("fr", [
    index("routes/fr._index.tsx"),
    route("portfolio", "routes/fr.portfolio.tsx"),
    route("portfolio/:slug", "routes/fr.portfolio.$slug.tsx"),
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
    route("portfolio/:slug", "routes/en.portfolio.$slug.tsx"),
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
  route("admin/bookings", "routes/admin.bookings.tsx"),
  route("admin/portfolio", "routes/admin.portfolio.tsx"),
  route("admin/portfolio/watermark", "routes/admin.portfolio.watermark.tsx"),
  route("admin/portfolio/upload", "routes/admin.portfolio.upload.tsx"),
  route("admin/portfolio/media/:photoId/:variant", "routes/admin.portfolio.media.$photoId.$variant.tsx"),
  route("admin/home", "routes/admin.home.tsx"),
  route("admin/about", "routes/admin.about.tsx"),
  route("admin/galleries", "routes/admin.galleries.tsx"),
  route("admin/galleries/new", "routes/admin.galleries.new.tsx"),
  route("admin/galleries/:id", "routes/admin.galleries.$id.tsx"),

  // ── Catch-all (404) ───────────────────────────────────────
  route("*", "routes/404.tsx"),
] satisfies RouteConfig;
