import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/en.gallery";
import { getGallerySession, GALLERY_PRIVATE_HEADERS } from "~/lib/gallery-auth.server";
import type { GalleryAccessLevel } from "~/lib/gallery-auth.server";
import { getGalleryByPublicId, getGalleryMedia } from "~/lib/gallery.server";
import { getGalleryDb } from "~/lib/gallery-db.server";
import { getSeoMeta } from "~/lib/seo";
import { GalleryView } from "./GalleryView";
import type { GalleryMedia } from "./GalleryView";

export function headers() {
  return GALLERY_PRIVATE_HEADERS;
}

interface LoaderData {
  gallery: {
    public_id: string;
    bride_names: string;
  };
}

export function meta({ data, matches }: { data?: LoaderData; matches: Record<string, unknown>[] }) {
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
  const galleryId = session.get("galleryId") as string | undefined;
  const accessLevel = session.get("accessLevel") as GalleryAccessLevel | undefined;
  const codeVersion = session.get("codeVersion") as number | undefined;

  const { requireAdminSession } = await import("~/lib/auth.server");
  const { isValid: isAdmin } = await requireAdminSession(request);

  if (!isAdmin && (!galleryId || !accessLevel || codeVersion === undefined)) {
    throw redirect("/en/client-area?status=unauthorized", {
      headers: GALLERY_PRIVATE_HEADERS,
    });
  }

  const gallery = getGalleryByPublicId(params.id);

  if (!gallery || gallery.status !== "published" || gallery.expires_at < Date.now()) {
    throw redirect("/en/client-area?status=unavailable", {
      headers: GALLERY_PRIVATE_HEADERS,
    });
  }

  if (!isAdmin && gallery.id !== galleryId) {
    throw redirect("/en/client-area?status=unavailable", {
      headers: GALLERY_PRIVATE_HEADERS,
    });
  }

  // Validate session against code version from gallery_codes (source of truth)
  if (!isAdmin) {
    const db = getGalleryDb();
    const codeRow = db.prepare("SELECT version FROM gallery_codes WHERE gallery_id = ? AND level = ?").get(galleryId!, accessLevel!) as { version: number } | undefined;
    if (!codeRow || codeRow.version !== codeVersion) {
      throw redirect("/en/client-area?status=expired", {
        headers: GALLERY_PRIVATE_HEADERS,
      });
    }
  }

  const finalAccessLevel = isAdmin ? "maries" : accessLevel!;
  const media = getGalleryMedia(gallery.id, finalAccessLevel);

  return Response.json({
    gallery: {
      public_id: gallery.public_id,
      bride_names: gallery.bride_names,
      wedding_date: gallery.wedding_date,
      location: gallery.location,
      intro_fr: gallery.intro_fr,
      intro_en: gallery.intro_en,
      signature_fr: gallery.signature_fr,
      signature_en: gallery.signature_en,
      cover_image_id: gallery.cover_image_id
    },
    accessLevel: finalAccessLevel,
    media: media as GalleryMedia[]
  }, {
    headers: GALLERY_PRIVATE_HEADERS
  });
}

export default function GalleryEn() {
  const data = useLoaderData<typeof loader>();
  const typed = data as unknown as { gallery: Parameters<typeof GalleryView>[0]["gallery"]; media: Parameters<typeof GalleryView>[0]["media"] };
  return <GalleryView lang="en" gallery={typed.gallery} media={typed.media} />;
}
