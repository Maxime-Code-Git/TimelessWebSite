import type { Route } from "./+types/en.about";
import { AboutPage } from "./AboutPage";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "About us — Timeless" },
    {
      name: "description",
      content:
        "Two perspectives, one standard: capturing your day with precision, so it comes back to you intact in thirty years.",
    },
  ];
}

export default function AboutEn() {
  return <AboutPage lang="en" />;
}
