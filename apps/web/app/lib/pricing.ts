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
  readonly name: string;
  readonly priceCents: number;
  readonly featured: boolean;
}

/** Pricing per category, each with 3 tiers in order: Essentiel, Signature, Prestige */
export const PRICING = {
  photo: [
    { name: "Essentiel", priceCents: 129_000, featured: false },
    { name: "Signature", priceCents: 179_000, featured: true },
    { name: "Prestige", priceCents: 239_000, featured: false },
  ],
  film: [
    { name: "Essentiel", priceCents: 149_000, featured: false },
    { name: "Signature", priceCents: 219_000, featured: true },
    { name: "Prestige", priceCents: 299_000, featured: false },
  ],
  duo: [
    { name: "Essentiel", priceCents: 249_000, featured: false },
    { name: "Signature", priceCents: 349_000, featured: true },
    { name: "Prestige", priceCents: 469_000, featured: false },
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
