import { redirect } from "react-router";
import type { Route } from "./+types/fr.gallery";

/**
 * Loader SSR — s'exécute uniquement côté serveur.
 *
 * Sans backend disponible (Phase 2), toute visite de /fr/galerie/:id
 * est redirigée immédiatement vers l'espace clients.
 * Aucun composant React n'est rendu, aucun contenu privé n'est transmis.
 *
 * En Phase 3, ce loader vérifiera la session serveur avant d'autoriser l'accès.
 */
export async function loader(_args: Route.LoaderArgs) {
  throw redirect("/fr/espace-clients?status=unavailable", {
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

// Le composant n'est jamais rendu — le loader redirige toujours.
// Cette export est requise par React Router mais ne sera pas exécutée.
export default function GalleryFr() {
  return null;
}
