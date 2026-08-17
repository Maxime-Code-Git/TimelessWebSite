import type { Route } from "./+types/en.portfolio";
import { PortfolioPage } from "./PortfolioPage";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Portfolio — Timeless" },
    {
      name: "description",
      content:
        "Discover our wedding photography and film portfolio. An honest look at your moments, captured as they are lived.",
    },
  ];
}

export default function PortfolioEn() {
  return <PortfolioPage lang="en" />;
}
