import type { Route } from "./+types/fr.portfolio";
import { PortfolioPage } from "./PortfolioPage";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Portfolio — Timeless" },
    {
      name: "description",
      content:
        "Découvrez notre portfolio de photographies et films de mariage. Un regard sincère sur vos instants, saisis tels qu'ils se vivent.",
    },
  ];
}

export default function PortfolioFr() {
  return <PortfolioPage lang="fr" />;
}
