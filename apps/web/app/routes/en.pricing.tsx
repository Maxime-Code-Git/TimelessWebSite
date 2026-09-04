import type { Route } from "./+types/en.pricing";
import { getSeoMeta } from "~/lib/seo";
import { FormulesPage } from "./FormulesPage";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Pricing & Packages — Sempra",
    description: "Discover our wedding photography and film packages. One studio for your image: one vision, from the first meeting to delivery.",
    path: "/en/pricing",
    alternatePath: "/fr/formules",
    lang: "en",
    noindex: false,
    siteUrl,
  });
}

export default function PricingEn() {
  return <FormulesPage lang="en" />;
}
