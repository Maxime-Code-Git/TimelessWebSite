import { redirect } from "react-router";
import type { Route } from "./+types/en.gallery";

/**
 * SSR loader — server-side only.
 *
 * Without an available backend (Phase 2), any visit to /en/gallery/:id
 * is immediately redirected to the client area.
 * No React component is rendered, no private content is transmitted.
 *
 * In Phase 3, this loader will verify the server session before granting access.
 */
export async function loader(_args: Route.LoaderArgs) {
  throw redirect("/en/client-area?status=unavailable", {
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

// The component is never rendered — the loader always redirects.
// This export is required by React Router but will never execute.
export default function GalleryEn() {
  return null;
}
