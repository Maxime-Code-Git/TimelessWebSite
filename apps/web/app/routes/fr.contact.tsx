import type { Route } from "./+types/fr.contact";
import { getSeoMeta } from "~/lib/seo";
import { ContactPage } from "./ContactPage";
import { processContactAction } from "~/lib/contact.server";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string; siteContent?: import("~/lib/site-content.server").SiteContent } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: rootData?.siteContent?.contactPage.seo.title.fr || "Contact — Sempra",
    description: rootData?.siteContent?.contactPage.seo.description.fr || "Contact Sempra Studio.",
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
