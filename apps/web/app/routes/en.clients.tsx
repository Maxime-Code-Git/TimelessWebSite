import type { Route } from "./+types/en.clients";
import { getSeoMeta } from "~/lib/seo";
import { ClientsPage } from "./ClientsPage";
import { loginGalleryClient } from "~/lib/gallery-auth.server";
import { ActionSecurityError } from "~/lib/admin-auth.server";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Client area — Sempra",
    description: "Access your private and secure gallery to find your photos and film.",
    path: "/en/client-area",
    alternatePath: "/fr/espace-clients",
    lang: "en",
    noindex: true,
    siteUrl,
  });
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const code = formData.get("code");
  if (!code || typeof code !== "string") {
    return Response.json({ error: "Code required" }, { status: 400 });
  }

  try {
    return await loginGalleryClient(request, code, "en");
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof ActionSecurityError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: "An error occurred." }, { status: 500 });
  }
}

export default function ClientsEn() {
  return <ClientsPage lang="en" />;
}
