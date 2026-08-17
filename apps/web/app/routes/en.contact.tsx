import type { Route } from "./+types/en.contact";
import { ContactPage } from "./ContactPage";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Contact us — Timeless" },
    {
      name: "description",
      content:
        "Write to us about your wedding project. We will take the time to reply within 48h.",
    },
  ];
}

export default function ContactEn() {
  return <ContactPage lang="en" />;
}
