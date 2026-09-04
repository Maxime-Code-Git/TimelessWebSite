import type { Route } from "./+types/fr.contact";
import { getSeoMeta } from "~/lib/seo";
import { ContactPage } from "./ContactPage";
import { processContactAction } from "~/lib/contact.server";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Contact — Sempra",
    description: "Écrivez-nous pour nous parler de votre projet de mariage. Nous prendrons le temps de vous répondre sous 48h.",
    path: "/fr/contact",
    alternatePath: "/en/contact",
    lang: "fr",
    noindex: false,
    siteUrl,
  });
}

export async function action({ request }: Route.ActionArgs) {
  return processContactAction(request, "fr");
}

export default function ContactFr() {
  return <ContactPage lang="fr" />;
}
