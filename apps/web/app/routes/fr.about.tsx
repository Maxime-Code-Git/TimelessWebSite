import type { Route } from "./+types/fr.about";
import { AboutPage } from "./AboutPage";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "À propos — Timeless" },
    {
      name: "description",
      content:
        "Deux regards, une même exigence : capter votre journée avec justesse, pour qu'elle vous revienne intacte dans trente ans.",
    },
  ];
}

export default function AboutFr() {
  return <AboutPage lang="fr" />;
}
