import {
  getSiteContent,
  type LegalDocument,
  type LegalPagesContent,
  type SiteContent,
} from "./site-content.server";

export type LegalPageKey = keyof LegalPagesContent;

export const VALID_LEGAL_PAGE_KEYS: readonly LegalPageKey[] = [
  "mentions",
  "privacy",
  "cgv",
  "cookies",
] as const;

export const LEGAL_404_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store",
});

export const EMPTY_LEGAL_DOCUMENT: Readonly<LegalDocument> = Object.freeze({
  version: 0,
  effectiveDate: null,
  lastModified: "",
  seoTitle: { fr: "", en: "" },
  seoDescription: { fr: "", en: "" },
  publicTitle: { fr: "", en: "" },
  intro: { fr: "", en: "" },
  sections: [],
});

export function createLegalNotFoundResponse(): Response {
  return new Response("Not Found", {
    status: 404,
    statusText: "Not Found",
    headers: { ...LEGAL_404_HEADERS },
  });
}

export function isLegalPageKey(key: unknown): key is LegalPageKey {
  return typeof key === "string" && (VALID_LEGAL_PAGE_KEYS as readonly string[]).includes(key);
}

/**
 * Loads validated site content and returns exclusively the published version
 * of the requested legal document.
 * Throws a secure 404 Response if published is null or key is invalid.
 * Never returns draft.
 */
export function getPublishedLegalDocument(pageKey: LegalPageKey): LegalDocument {
  if (!isLegalPageKey(pageKey)) {
    throw createLegalNotFoundResponse();
  }

  const content = getSiteContent();
  const pageState = content.legalPages?.[pageKey];
  const published = pageState?.published;

  if (!published) {
    throw createLegalNotFoundResponse();
  }

  return published;
}

/**
 * Strips unpublished legal drafts and history from siteContent before
 * sending root loader data to public visitors.
 * Ensures unpublished draft text never leaks into client HTML/JSON serialization.
 */
export function sanitizeSiteContentForPublic(content: SiteContent): SiteContent {
  return {
    ...content,
    legalPages: {
      mentions: {
        draft: EMPTY_LEGAL_DOCUMENT,
        published: content.legalPages.mentions.published,
        history: [],
      },
      privacy: {
        draft: EMPTY_LEGAL_DOCUMENT,
        published: content.legalPages.privacy.published,
        history: [],
      },
      cgv: {
        draft: EMPTY_LEGAL_DOCUMENT,
        published: content.legalPages.cgv.published,
        history: [],
      },
      cookies: {
        draft: EMPTY_LEGAL_DOCUMENT,
        published: content.legalPages.cookies.published,
        history: [],
      },
    },
  };
}

/**
 * Extracts and sets security and cache headers for legal routes.
 * When a 404 error response occurs, propagates X-Robots-Tag and Cache-Control.
 */
export function getLegalRouteHeaders(args: { errorHeaders?: Headers; loaderHeaders?: Headers }): Headers {
  const headers = new Headers();
  const source = args.errorHeaders || args.loaderHeaders;
  const robots = source?.get("X-Robots-Tag");
  if (robots) {
    headers.set("X-Robots-Tag", robots);
  }
  const cache = source?.get("Cache-Control");
  if (cache) {
    headers.set("Cache-Control", cache);
  }
  return headers;
}
