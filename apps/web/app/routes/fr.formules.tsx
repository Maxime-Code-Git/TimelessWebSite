import type { Route } from "./+types/fr.formules";
import { FormulesPage } from "./FormulesPage";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Formules & Tarifs — Timeless" },
    {
      name: "description",
      content:
        "Découvrez nos formules photo et vidéo de mariage. Un seul studio pour votre image : une même vision, du premier rendez-vous à la livraison.",
    },
  ];
}

export default function FormulesFr() {
  return <FormulesPage lang="fr" />;
}
