import type { Route } from "./+types/en.portfolio";
import { useLoaderData } from "react-router";
import { getSeoMeta } from "~/lib/seo";
import { getPublishedProjects } from "~/lib/portfolio-content.server";
import { PortfolioPage } from "./PortfolioPage";

export function loader() {
  return { projects: getPublishedProjects() };
}

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
  const { projects } = useLoaderData<typeof loader>();
  return <PortfolioPage lang="en" projects={projects} />;
}
