import type { Route } from "./+types/fr.portfolio.$slug";
import { useLoaderData } from "react-router";
import { getPublishedProjectBySlug } from "~/lib/portfolio-content.server";
import { getSeoMeta } from "~/lib/seo";
import { PortfolioProjectPage } from "./PortfolioProjectPage";

export function loader({ params }: Route.LoaderArgs) {
  const project = params.slug
    ? getPublishedProjectBySlug("fr", params.slug)
    : undefined;
  if (!project) throw new Response("Not Found", { status: 404 });
  return { project };
}

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find(match => match?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";
  const routeData = matches.at(-1)?.loaderData as ReturnType<typeof loader> | undefined;
  const project = routeData?.project;
  if (!project) return [{ title: "Projet introuvable — Timeless" }];

  return getSeoMeta({
    title: project.title.fr + " — Timeless",
    description: project.description.fr,
    path: "/fr/portfolio/" + project.slug.fr,
    alternatePath: "/en/portfolio/" + project.slug.en,
    lang: "fr",
    noindex: false,
    siteUrl,
  });
}

export default function PortfolioProjectFr() {
  const { project } = useLoaderData<typeof loader>();
  return <PortfolioProjectPage lang="fr" project={project} />;
}
