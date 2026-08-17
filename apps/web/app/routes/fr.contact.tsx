import type { Route } from "./+types/fr.contact";
import { ContactPage } from "./ContactPage";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Contact — Timeless" },
    {
      name: "description",
      content:
        "Écrivez-nous pour nous parler de votre projet de mariage. Nous prendrons le temps de vous répondre sous 48h.",
    },
  ];
}

export default function ContactFr() {
  return <ContactPage lang="fr" />;
}
