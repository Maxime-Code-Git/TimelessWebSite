import type { Route } from "./+types/fr.cookies";
import { LegalPageView } from "~/components/legal/LegalPageView";
import { getSeoMeta } from "~/lib/seo";
import { getPublishedLegalDocument, getLegalRouteHeaders } from "~/lib/legal.server";
import NotFound from "./404";

export function headers(args: Route.HeadersArgs) {
  return getLegalRouteHeaders(args);
}

export function loader() {
  const document = getPublishedLegalDocument("cookies");
  return { document };
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  if (!loaderData?.document) {
    return [
      { title: "Page introuvable | Sempra Photo & Video" },
      { name: "robots", content: "noindex, nofollow" },
    ];
  }

  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";
  const doc = loaderData.document;

  return getSeoMeta({
    title: doc.seoTitle.fr || "",
    description: doc.seoDescription.fr || "",
    path: "/fr/cookies",
    alternatePath: "/en/cookies",
    lang: "fr",
    noindex: true,
    siteUrl,
  });
}

export default function LegalRoute({ loaderData }: Route.ComponentProps) {
  return (
    <LegalPageView
      lang="fr"
      alternateLangHref="/en/cookies"
      document={loaderData.document}
      isDraft={false}
    />
  );
}

export function ErrorBoundary() {
  return <NotFound />;
}
