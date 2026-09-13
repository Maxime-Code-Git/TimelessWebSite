import type { Route } from "./+types/fr.about";
import { getSeoMeta } from "~/lib/seo";
import { AboutPage } from "./AboutPage";
import type { SiteContent } from "~/lib/site-content.server";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string, siteContent?: SiteContent } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: rootData?.siteContent?.aboutPage.seo.title.fr || "À propos — Sempra",
    description: rootData?.siteContent?.aboutPage.seo.description.fr || "Deux regards, une même exigence : capter votre journée avec justesse, pour qu'elle vous revienne intacte dans trente ans.",
    path: "/fr/a-propos",
    alternatePath: "/en/about",
    lang: "fr",
    noindex: false,
    siteUrl,
  });
}

export default function AboutFr() {
  return <AboutPage lang="fr" />;
}
