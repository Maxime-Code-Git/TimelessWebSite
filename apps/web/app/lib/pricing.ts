/**
 * Pricing configuration for Timeless studio.
 *
 * In Phase 3B, these values are managed from the administration panel
 * and loaded via SSR from site-content.json.
 *
 * This file now only provides types and pure formatters.
 */

export type FormulaCategory = "photo" | "film" | "duo";

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
