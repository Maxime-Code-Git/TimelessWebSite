import type { Route } from "./+types/en._index";
import { HomePage } from "./HomePage";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Timeless — Wedding Photo & Video in Belgium" },
    {
      name: "description",
      content:
        "High-end wedding photography and videography studio in Belgium. Two perspectives, one studio — making your day eternal.",
    },
  ];
}

export default function HomeEn() {
  return <HomePage lang="en" />;
}
