import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/en.gallery";
import { getGallerySession } from "~/lib/gallery-auth.server";
import type { GalleryAccessLevel } from "~/lib/gallery-auth.server";
import { getGalleryByPublicId, getGalleryMedia } from "~/lib/gallery.server";
import { getSeoMeta } from "~/lib/seo";
import { GalleryView } from "./GalleryView";
import type { GalleryMedia } from "./GalleryView";

interface LoaderData {
  gallery: {
    public_id: string;
    bride_names: string;
  };
}

export function meta({ data, matches }: { data?: LoaderData, matches: Record<string, unknown>[] }) {
  const rootData = matches.find((m: Record<string, unknown>) => m?.id === "root")?.loaderData as { PUBLIC_SITE_URL?: string } | undefined;
  const siteUrl = rootData?.PUBLIC_SITE_URL || "http://localhost:5173";

  return getSeoMeta({
    title: data?.gallery ? `${data.gallery.bride_names}'s Gallery — Sempra` : "Gallery — Sempra",
    description: "Your private gallery.",
    path: `/en/gallery/${data?.gallery?.public_id || ""}`,
    lang: "en",
    noindex: true,
    siteUrl,
  });
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getGallerySession(request);
  const galleryId = session.get("galleryId");
  const accessLevel = session.get("accessLevel") as GalleryAccessLevel | undefined;
  const codeVersion = session.get("codeVersion") as number | undefined;

  if (!galleryId || !accessLevel || codeVersion === undefined) {
    throw redirect("/en/client-area?status=unauthorized");
  }

  const gallery = getGalleryByPublicId(params.id);
  
  if (!gallery || gallery.id !== galleryId || gallery.status !== "published" || gallery.expires_at < Date.now()) {
    throw redirect("/en/client-area?status=unavailable");
  }

  // Validate session against code version to ensure codes weren't rotated
  const currentVersion = accessLevel === "maries" ? gallery.couple_code_version : gallery.guest_code_version;
  if (codeVersion !== currentVersion) {
    throw redirect("/en/client-area?status=expired");
  }

  const media = getGalleryMedia(gallery.id, accessLevel);

  return {
    gallery: {
      id: gallery.id,
      public_id: gallery.public_id,
      bride_names: gallery.bride_names,
      wedding_date: gallery.wedding_date,
      location: gallery.location,
      intro_fr: gallery.intro_fr,
      intro_en: gallery.intro_en,
      signature_fr: gallery.signature_fr,
      signature_en: gallery.signature_en
    },
    accessLevel,
    media: media as unknown as GalleryMedia[]
  };
}

export default function GalleryEn() {
  const data = useLoaderData<typeof loader>();
  return <GalleryView lang="en" {...data} />;
}
