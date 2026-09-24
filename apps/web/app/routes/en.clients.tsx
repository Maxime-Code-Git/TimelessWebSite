import type { Route } from "./+types/en.clients";
import { getSeoMeta } from "~/lib/seo";
import { ClientsPage } from "./ClientsPage";
import { loginGalleryClient, getGallerySession, createCsrfToken, gallerySessionStorage } from "~/lib/gallery-auth.server";
import { ActionSecurityError } from "~/lib/admin-auth.server";
import { validateOrigin, readStrictFormUrlEncoded } from "~/lib/security.server";

export function meta({ matches }: Route.MetaArgs) {
  const rootData = matches.find((m) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: "Client area | Sempra",
    description: "Access your private and secure gallery to find your photos and film.",
    path: "/en/client-area",
    alternatePath: "/fr/espace-clients",
    lang: "en",
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
  let searchParams: URLSearchParams;
  try {
    searchParams = await readStrictFormUrlEncoded(request, 500);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Payload Too Large") return new Response("Payload Too Large", { status: 413 });
    return new Response("Unsupported Media Type", { status: 415 });
  }

  if (!validateOrigin(request)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    return await loginGalleryClient(request, searchParams, "en");
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
