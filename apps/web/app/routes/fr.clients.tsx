import type { Route } from "./+types/fr.clients";
import { getSeoMeta } from "~/lib/seo";
import { ClientsPage } from "./ClientsPage";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Espace clients — Sempra",
    description: "Accédez à votre galerie privée et sécurisée pour retrouver vos photos et votre film.",
    path: "/fr/espace-clients",
    alternatePath: "/en/client-area",
    lang: "fr",
    noindex: true,
    siteUrl,
  });
}

export default function ClientsFr() {
  return <ClientsPage lang="fr" />;
}
