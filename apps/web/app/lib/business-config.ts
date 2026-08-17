/**
 * Business configuration for Timeless studio.
 *
 * Values default to null when not yet confirmed.
 * When a value is null, its corresponding UI element MUST be hidden entirely.
 * Never display placeholder text like "[À configurer]" to end users.
 *
 * In Phase 3, these values will be managed from the administration panel.
 */
export const BUSINESS = {
  /** Official studio name */
  studioName: "Timeless",

  /** Studio address — null until confirmed */
  address: null as string | null,

  /** Belgian enterprise number (BE XXXX.XXX.XXX) — null until confirmed */
  enterpriseNumber: null as string | null,

  /** Public contact email */
  email: "timelessstudiolm@gmail.com",

  /** mailto: href for email */
  emailHref: "mailto:timelessstudiolm@gmail.com",

  /** Display phone number */
  phone: "+32 477 86 37 42",

  /** tel: href for phone */
  phoneHref: "tel:+32477863742",

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

  /** Zone d'intervention */
  serviceArea: {
    fr: "Belgique & mariages à l'étranger",
    en: "Belgium & destination weddings",
  },
} as const;
