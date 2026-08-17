import type { Route } from "./+types/en.clients";
import { ClientsPage } from "./ClientsPage";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Client area — Timeless" },
    {
      name: "description",
      content:
        "Access your private and secure gallery to retrieve your photos and film.",
    },
  ];
}

export default function ClientsEn() {
  return <ClientsPage lang="en" />;
}
