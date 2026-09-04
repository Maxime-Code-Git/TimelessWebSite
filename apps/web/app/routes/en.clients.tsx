import type { Route } from "./+types/en.clients";
import { getSeoMeta } from "~/lib/seo";
import { ClientsPage } from "./ClientsPage";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Client area — Sempra",
    description: "Access your private and secure gallery to retrieve your photos and film.",
    path: "/en/client-area",
    alternatePath: "/fr/espace-clients",
    lang: "en",
    noindex: true,
    siteUrl,
  });
}

export default function ClientsEn() {
  return <ClientsPage lang="en" />;
}
