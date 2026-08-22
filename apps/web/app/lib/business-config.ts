/**
 * Business configuration for Timeless studio.
 *
 * In Phase 3B, these values are managed from the administration panel
 * and loaded via SSR from site-content.json.
 *
 * Some fixed constants (like the studio name) remain here.
 */

export const STUDIO_NAME = "Timeless";
export const PHOTOGRAPHER_1_ROLE = "Photographe";
export const PHOTOGRAPHER_2_ROLE = "Vidéaste";

// The rest of the dynamic business data is now typed via SiteContent
// in apps/web/app/lib/site-content.server.ts and loaded in root.tsx
