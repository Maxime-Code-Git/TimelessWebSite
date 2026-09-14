import type { Route } from "./+types/fr.clients";
import { getSeoMeta } from "~/lib/seo";
import { ClientsPage } from "./ClientsPage";
import { loginGalleryClient } from "~/lib/gallery-auth.server";
import { ActionSecurityError } from "~/lib/admin-auth.server";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Espace clients — Sempra",
    description: "Accédez à votre galerie privée et sécurisée pour retrouver vos photos et votre film.",
    path: "/fr/espace-clients",
    alternatePath: "/en/client-area",
    lang: "fr",
    noindex: true,
    siteUrl,
  });
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const code = formData.get("code");
  if (!code || typeof code !== "string") {
    return Response.json({ error: "Code requis" }, { status: 400 });
  }

  try {
    return await loginGalleryClient(request, code, "fr");
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof ActionSecurityError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}

export default function ClientsFr() {
  return <ClientsPage lang="fr" />;
}
