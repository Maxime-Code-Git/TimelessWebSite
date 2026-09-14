import type { Route } from "./+types/fr.clients";
import { getSeoMeta } from "~/lib/seo";
import { ClientsPage } from "./ClientsPage";
import { loginGalleryClient, getGallerySession, createCsrfToken, gallerySessionStorage } from "~/lib/gallery-auth.server";
import { ActionSecurityError } from "~/lib/admin-auth.server";
import { validateOrigin } from "~/lib/security.server";

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

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getGallerySession(request);
  let csrf = session.get("csrf");
  if (!csrf) {
    csrf = createCsrfToken();
    session.set("csrf", csrf);
  }
  return Response.json({ csrf }, {
    headers: {
      "Set-Cookie": await gallerySessionStorage.commitSession(session)
    }
  });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const contentType = request.headers.get("Content-Type");
  if (!contentType || !contentType.includes("application/x-www-form-urlencoded")) {
    return new Response("Unsupported Media Type", { status: 415 });
  }
  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > 500) {
    return new Response("Payload Too Large", { status: 413 });
  }
  if (!validateOrigin(request)) {
    return new Response("Forbidden", { status: 403 });
  }

  const text = await request.text();
  const searchParams = new URLSearchParams(text);

  try {
    return await loginGalleryClient(request, searchParams, "fr");
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
