import type { Route } from "./+types/en.portfolio.$slug";
import { useLoaderData } from "react-router";
import { getPublishedProjectBySlug } from "~/lib/portfolio-content.server";
import { getSeoMeta } from "~/lib/seo";
import { PortfolioProjectPage } from "./PortfolioProjectPage";

export function loader({ params }: Route.LoaderArgs) {
  const project = params.slug
    ? getPublishedProjectBySlug("en", params.slug)
    : undefined;
  if (!project) throw new Response("Not Found", { status: 404 });
  return { project };
}

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find(match => match?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";
  const routeData = matches.at(-1)?.loaderData as ReturnType<typeof loader> | undefined;
  const project = routeData?.project;
  if (!project) return [{ title: "Project not found — Sempra" }];

  return getSeoMeta({
    title: project.title.en + " — Sempra",
    description: project.description.en,
    path: "/en/portfolio/" + project.slug.en,
    alternatePath: "/fr/portfolio/" + project.slug.fr,
    lang: "en",
    noindex: false,
    siteUrl,
  });
}

export default function PortfolioProjectEn() {
  const { project } = useLoaderData<typeof loader>();
  return <PortfolioProjectPage lang="en" project={project} />;
}
