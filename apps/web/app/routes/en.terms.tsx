import type { Route } from "./+types/en.terms";
import { LegalPageView } from "~/components/legal/LegalPageView";
import { getSeoMeta } from "~/lib/seo";
import { getPublishedLegalDocument, getLegalRouteHeaders } from "~/lib/legal.server";
import NotFound from "./404";

export function headers(args: Route.HeadersArgs) {
  return getLegalRouteHeaders(args);
}

export function loader() {
  const document = getPublishedLegalDocument("cgv");
  return { document };
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  if (!loaderData?.document) {
    return [
      { title: "Page not found | Sempra Photo & Video" },
      { name: "robots", content: "noindex, nofollow" },
    ];
  }

  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";
  const doc = loaderData.document;

  return getSeoMeta({
    title: doc.seoTitle.en || "",
    description: doc.seoDescription.en || "",
    path: "/en/terms",
    alternatePath: "/fr/cgv",
    lang: "en",
    noindex: true,
    siteUrl,
  });
}

export default function LegalRoute({ loaderData }: Route.ComponentProps) {
  return (
    <LegalPageView
      lang="en"
      alternateLangHref="/fr/cgv"
      document={loaderData.document}
      isDraft={false}
    />
  );
}

export function ErrorBoundary() {
  return <NotFound />;
}
