import type { Route } from "./+types/en.about";
import { getSeoMeta } from "~/lib/seo";
import { AboutPage } from "./AboutPage";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "About us — Timeless",
    description: "Two perspectives, one standard: capturing your day with precision, so it comes back to you intact in thirty years.",
    path: "/en/about",
    alternatePath: "/fr/a-propos",
    lang: "en",
    noindex: false,
    siteUrl,
  });
}

export default function AboutEn() {
  return <AboutPage lang="en" />;
}
