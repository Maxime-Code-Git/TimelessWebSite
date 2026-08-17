import type { Route } from "./+types/fr._index";
import { HomePage } from "./HomePage";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Timeless — Photo & Vidéo de mariage en Belgique" },
    {
      name: "description",
      content:
        "Studio de photographie et vidéo de mariage haut de gamme en Belgique. Deux regards, un seul studio — pour que votre journée reste éternelle.",
    },
  ];
}

export default function HomeFr() {
  return <HomePage lang="fr" />;
}
