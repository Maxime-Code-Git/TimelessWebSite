import type { Route } from "./+types/en._index";
import { HomePage } from "./HomePage";

import { getSeoMeta } from "~/lib/seo";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Timeless — Wedding Photo & Video in Belgium",
    description: "High-end wedding photography and videography studio in Belgium. Two perspectives, one studio — making your day eternal.",
    path: "/en/",
    alternatePath: "/fr/",
    lang: "en",
    siteUrl,
  });
}

export default function HomeEn() {
  return <HomePage lang="en" />;
}
