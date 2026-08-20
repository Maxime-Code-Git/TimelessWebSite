import type { Route } from "./+types/en.portfolio";
import { getSeoMeta } from "~/lib/seo";
import { PortfolioPage } from "./PortfolioPage";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Portfolio — Timeless",
    description: "Discover our wedding photography and film portfolio. An honest look at your moments, captured as they are lived.",
    path: "/en/portfolio",
    alternatePath: "/fr/portfolio",
    lang: "en",
    noindex: false,
    siteUrl,
  });
}

export default function PortfolioEn() {
  return <PortfolioPage lang="en" />;
}
