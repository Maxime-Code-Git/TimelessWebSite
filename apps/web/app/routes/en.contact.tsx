import type { Route } from "./+types/en.contact";
import { getSeoMeta } from "~/lib/seo";
import { ContactPage } from "./ContactPage";
import { processContactAction } from "~/lib/contact.server";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Contact us — Timeless",
    description: "Write to us about your wedding project. We will take the time to reply within 48h.",
    path: "/en/contact",
    alternatePath: "/fr/contact",
    lang: "en",
    noindex: false,
    siteUrl,
  });
}

export async function action({ request }: Route.ActionArgs) {
  return processContactAction(request, "en");
}

export default function ContactEn() {
  return <ContactPage lang="en" />;
}
