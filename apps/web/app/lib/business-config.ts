/**
 * Business configuration for Timeless studio.
 *
 * All values default to null — fill in before going live.
 * When a value is null, its corresponding UI element MUST be hidden entirely.
 * Never display placeholder text like "[À configurer]" to end users.
 *
 * This file is committed with all nulls. Real values are NOT committed.
 * In Phase 3, sensitive values (email, phone) will be moved to server-side env vars.
 */
export const BUSINESS = {
  /** Official studio name */
  studioName: "Timeless",

  /** Studio address — null until confirmed */
  address: null as string | null,

  /** Belgian enterprise number (BE XXXX.XXX.XXX) — null until confirmed */
  enterpriseNumber: null as string | null,

  /** Public contact email — null until confirmed */
  email: null as string | null,

  /** Display phone number — null until confirmed */
  phone: null as string | null,

  /** tel: href for phone — null until confirmed */
  phoneHref: null as string | null,

  /** Hosting provider name — null until confirmed */
  hostingProvider: null as string | null,

  /** Hosting provider address — null until confirmed */
  hostingAddress: null as string | null,

  /** Deposit percentage (e.g. 30) — null until legally validated */
  depositPercent: null as number | null,

  /** Photographer/videographer 1 name — null until confirmed */
  photographer1Name: null as string | null,

  /** Role label for person 1 */
  photographer1Role: "Photographe",

  /** Photographer/videographer 2 name — null until confirmed */
  photographer2Name: null as string | null,

  /** Role label for person 2 */
  photographer2Role: "Vidéaste",

  /** Instagram profile URL — null until confirmed */
  instagramUrl: null as string | null,

  /** LinkedIn profile URL — null until confirmed */
  linkedinUrl: null as string | null,
} as const;
