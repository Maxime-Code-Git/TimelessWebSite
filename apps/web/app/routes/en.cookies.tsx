import type { SiteContent } from "~/lib/site-content.server";
import type { Route } from "./+types/en.cookies";
import { LegalPageView } from "~/components/legal/LegalPageView";
import { useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "../root";
import { getSeoMeta } from "~/lib/seo";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string, siteContent?: SiteContent } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";
  const content = rootData?.siteContent?.legalPages?.cookies;
  const doc = content?.published || content?.draft;

  return getSeoMeta({
    title: doc?.seoTitle?.en || "",
    description: doc?.seoDescription?.en || "",
    path: "/en/cookies",
    alternatePath: "/fr/cookies",
    lang: "en",
    noindex: true,
    siteUrl,
  });
}

export default function LegalRoute() {
  const rootData = useRouteLoaderData<typeof rootLoader>("root");
  const content = rootData?.siteContent?.legalPages?.cookies;

  if (!content) return null;

  const isDraft = !content.published;
  const doc = content.published || content.draft;

  return (
    <LegalPageView
      lang="en"
      alternateLangHref="/fr/cookies"
      document={doc}
      isDraft={isDraft}
    />
  );
}
