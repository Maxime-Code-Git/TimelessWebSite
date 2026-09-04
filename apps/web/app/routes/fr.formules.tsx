import type { Route } from "./+types/fr.formules";
import { getSeoMeta } from "~/lib/seo";
import { FormulesPage } from "./FormulesPage";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Formules & Tarifs — Sempra",
    description: "Découvrez nos formules photo et vidéo de mariage. Un seul studio pour votre image : une même vision, du premier rendez-vous à la livraison.",
    path: "/fr/formules",
    alternatePath: "/en/pricing",
    lang: "fr",
    noindex: false,
    siteUrl,
  });
}

export default function FormulesFr() {
  return <FormulesPage lang="fr" />;
}
