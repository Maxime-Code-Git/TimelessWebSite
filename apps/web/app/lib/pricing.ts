/**
 * Pricing configuration for Timeless studio.
 *
 * All prices are stored in cents to avoid floating-point issues.
 * In Phase 3, these values will come from the database via the admin panel.
 *
 * Use formatPrice() to display prices with the correct locale.
 */

export interface TierPricing {
  /** Price in euro cents */
  readonly priceCents: number;
}

export interface FormulaTier {
  readonly id: "essential" | "signature" | "prestige";
  readonly priceCents: number;
  readonly featured: boolean;
}

/** Pricing per category, each with 3 tiers in order: Essentiel, Signature, Prestige */
export const PRICING = {
  photo: [
    { id: "essential", priceCents: 129_000, featured: false },
    { id: "signature", priceCents: 179_000, featured: true },
    { id: "prestige", priceCents: 239_000, featured: false },
  ],
  film: [
    { id: "essential", priceCents: 149_000, featured: false },
    { id: "signature", priceCents: 219_000, featured: true },
    { id: "prestige", priceCents: 299_000, featured: false },
  ],
  duo: [
    { id: "essential", priceCents: 249_000, featured: false },
    { id: "signature", priceCents: 349_000, featured: true },
    { id: "prestige", priceCents: 469_000, featured: false },
  ],
} as const;

export type FormulaCategory = keyof typeof PRICING;

/**
 * Format a price in cents to a display string.
 *
 * FR: "À partir de 1 290 €"
 * EN: "From €1,290"
 */
export function formatPrice(priceCents: number, lang: "fr" | "en"): string {
  const euros = priceCents / 100;
  const formatted = new Intl.NumberFormat(lang === "fr" ? "fr-BE" : "en-BE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(euros);

  if (lang === "fr") {
    return `À partir de ${formatted}`;
  }
  return `From ${formatted}`;
}
