import type { Route } from "./+types/en.pricing";
import { FormulesPage } from "./FormulesPage";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Pricing & Packages — Timeless" },
    {
      name: "description",
      content:
        "Discover our wedding photography and film packages. One studio for your image: one vision, from the first meeting to delivery.",
    },
  ];
}

export default function PricingEn() {
  return <FormulesPage lang="en" />;
}
