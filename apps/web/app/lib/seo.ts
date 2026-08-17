/**
 * Helper pur pour générer les balises SEO, Open Graph et hreflang.
 *
 * Les composants et loaders ne lisent pas process.env directement pour éviter 
 * l'injection accidentelle dans le bundle client. La variable PUBLIC_SITE_URL
 * est transmise via l'argument `matches` dans la fonction meta.
 */

interface SeoArgs {
  title: string;
  description: string;
  /** Le chemin relatif, par exemple "/fr/formules" */
  path: string;
  /** Le chemin alternatif en anglais, par exemple "/en/pricing" (ou vice-versa) */
  alternatePath?: string;
  lang: "fr" | "en";
  noindex?: boolean;
  /** URL de base fournie par le root loader */
  siteUrl: string;
}

export function getSeoMeta({
  title,
  description,
  path,
  alternatePath,
  lang,
  noindex = false,
  siteUrl,
}: SeoArgs) {
  const absoluteUrl = `${siteUrl}${path}`;
  const absoluteAltUrl = alternatePath ? `${siteUrl}${alternatePath}` : undefined;
  
  // Par défaut, la racine /en/ est l'équivalent de /fr/ etc.
  // x-default est généralement défini sur /fr/ ou /en/. Disons /fr/ pour ce site basé en Belgique,
  // ou on route vers le contenu français par défaut.
  const isFr = lang === "fr";
  const defaultPath = isFr ? path : (alternatePath || path);
  const xDefaultUrl = `${siteUrl}${defaultPath}`;

  const meta: Record<string, string>[] = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: absoluteUrl },
    { property: "og:locale", content: isFr ? "fr_BE" : "en_BE" },
  ];

  if (absoluteAltUrl) {
    meta.push({ property: "og:locale:alternate", content: isFr ? "en_BE" : "fr_BE" });
  }

  if (noindex) {
    meta.push({ name: "robots", content: "noindex, nofollow" });
  }

  // Tags <link> via la fonction meta (supporté dans React Router v7)
  const links: Record<string, string>[] = [
    { tagName: "link", rel: "canonical", href: absoluteUrl },
    { tagName: "link", rel: "alternate", hreflang: lang, href: absoluteUrl },
  ];

  if (absoluteAltUrl) {
    const altLang = isFr ? "en" : "fr";
    links.push({ tagName: "link", rel: "alternate", hreflang: altLang, href: absoluteAltUrl });
  }
  
  // x-default pointera vers le français
  links.push({ tagName: "link", rel: "alternate", hreflang: "x-default", href: xDefaultUrl });

  return [...meta, ...links];
}
