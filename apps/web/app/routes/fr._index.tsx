import type { Route } from "./+types/fr._index";
import { HomePage } from "./HomePage";

import { getSeoMeta } from "~/lib/seo";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches[0]?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Timeless — Photo & Vidéo de mariage en Belgique",
    description: "Studio de photographie et vidéo de mariage haut de gamme en Belgique. Deux regards, un seul studio — pour que votre journée reste éternelle.",
    path: "/fr/",
    alternatePath: "/en/",
    lang: "fr",
    siteUrl,
  });
}

export default function HomeFr() {
  return <HomePage lang="fr" />;
}
