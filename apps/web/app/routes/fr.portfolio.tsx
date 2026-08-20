import type { Route } from "./+types/fr.portfolio";
import { getSeoMeta } from "~/lib/seo";
import { PortfolioPage } from "./PortfolioPage";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Portfolio — Timeless",
    description: "Découvrez notre portfolio de photographies et films de mariage. Un regard sincère sur vos instants, saisis tels qu'ils se vivent.",
    path: "/fr/portfolio",
    alternatePath: "/en/portfolio",
    lang: "fr",
    noindex: false,
    siteUrl,
  });
}

export default function PortfolioFr() {
  return <PortfolioPage lang="fr" />;
}
