import type { Route } from "./+types/fr.clients";
import { ClientsPage } from "./ClientsPage";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Espace clients — Timeless" },
    {
      name: "description",
      content:
        "Accédez à votre galerie privée et sécurisée pour retrouver vos photos et votre film.",
    },
  ];
}

export default function ClientsFr() {
  return <ClientsPage lang="fr" />;
}
