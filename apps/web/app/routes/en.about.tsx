import type { Route } from "./+types/en.about";
import { getSeoMeta } from "~/lib/seo";
import { AboutPage } from "./AboutPage";
import type { SiteContent } from "~/lib/site-content.server";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string, siteContent?: SiteContent } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: rootData?.siteContent?.aboutPage.seo.title.en || "About | Sempra",
    description: rootData?.siteContent?.aboutPage.seo.description.en || "Two perspectives, one standard: capturing your day with accuracy, so it returns to you intact in thirty years.",
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
