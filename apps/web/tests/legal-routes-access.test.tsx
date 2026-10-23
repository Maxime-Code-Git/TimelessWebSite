import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";

import {
  loader as frLegalLoader,
  meta as frLegalMeta,
  headers as frLegalHeaders,
  default as FrLegalRoute,
  ErrorBoundary as FrLegalErrorBoundary,
} from "../app/routes/fr.legal";
import {
  loader as enLegalLoader,
  meta as enLegalMeta,
  headers as enLegalHeaders,
  default as EnLegalRoute,
  ErrorBoundary as EnLegalErrorBoundary,
} from "../app/routes/en.legal";
import {
  loader as frPrivacyLoader,
  meta as frPrivacyMeta,
  headers as frPrivacyHeaders,
  default as FrPrivacyRoute,
  ErrorBoundary as FrPrivacyErrorBoundary,
} from "../app/routes/fr.privacy";
import {
  loader as enPrivacyLoader,
  meta as enPrivacyMeta,
  headers as enPrivacyHeaders,
  default as EnPrivacyRoute,
  ErrorBoundary as EnPrivacyErrorBoundary,
} from "../app/routes/en.privacy";
import {
  loader as frCgvLoader,
  meta as frCgvMeta,
  headers as frCgvHeaders,
  default as FrCgvRoute,
  ErrorBoundary as FrCgvErrorBoundary,
} from "../app/routes/fr.cgv";
import {
  loader as enTermsLoader,
  meta as enTermsMeta,
  headers as enTermsHeaders,
  default as EnTermsRoute,
  ErrorBoundary as EnTermsErrorBoundary,
} from "../app/routes/en.terms";
import {
  loader as frCookiesLoader,
  meta as frCookiesMeta,
  headers as frCookiesHeaders,
  default as FrCookiesRoute,
  ErrorBoundary as FrCookiesErrorBoundary,
} from "../app/routes/fr.cookies";
import {
  loader as enCookiesLoader,
  meta as enCookiesMeta,
  headers as enCookiesHeaders,
  default as EnCookiesRoute,
  ErrorBoundary as EnCookiesErrorBoundary,
} from "../app/routes/en.cookies";

import {
  getPublishedLegalDocument,
  sanitizeSiteContentForPublic,
  EMPTY_LEGAL_DOCUMENT,
  LEGAL_404_HEADERS,
  type LegalPageKey,
} from "../app/lib/legal.server";
import { getSiteContent, type LegalDocument } from "../app/lib/site-content.server";
import { LegalPageView } from "../app/components/legal/LegalPageView";

let mockLocationPath = "/fr/mentions-legales";

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useLocation: () => ({
      pathname: mockLocationPath,
      search: "",
      hash: "",
      state: null,
      key: "test-location",
    }),
    useRouteLoaderData: () => ({
      PUBLIC_SITE_URL: "http://localhost:5173",
      siteContent: getSiteContent(),
    }),
    Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
      <a href={to} {...props}>{children}</a>
    ),
    NavLink: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
      <a href={to} {...props}>{children}</a>
    ),
  };
});

const mockMatches = [
  {
    id: "root",
    pathname: "/",
    params: {},
    data: { PUBLIC_SITE_URL: "http://localhost:5173" },
    handle: undefined,
    loaderData: { PUBLIC_SITE_URL: "http://localhost:5173" },
  },
];

const mockLocation = {
  pathname: "/fr/mentions-legales",
  search: "",
  hash: "",
  state: null,
  key: "test-key",
};

describe("Legal Public Routes Security - Unpublished Drafts Isolation", () => {
  it("rejects /fr/mentions-legales with 404 when published is null", async () => {
    try {
      await frLegalLoader();
      expect.unreachable("Expected fr.legal loader to throw 404 Response");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(404);
    }
  });

  it("rejects /en/legal with 404 when published is null", async () => {
    try {
      await enLegalLoader();
      expect.unreachable("Expected en.legal loader to throw 404 Response");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(404);
    }
  });

  it("rejects confidentiality and privacy routes with 404 when published is null", async () => {
    try {
      await frPrivacyLoader();
      expect.unreachable("Expected fr.privacy loader to throw 404 Response");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(404);
    }

    try {
      await enPrivacyLoader();
      expect.unreachable("Expected en.privacy loader to throw 404 Response");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(404);
    }
  });

  it("rejects cgv and terms routes with 404 when published is null", async () => {
    try {
      await frCgvLoader();
      expect.unreachable("Expected fr.cgv loader to throw 404 Response");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(404);
    }

    try {
      await enTermsLoader();
      expect.unreachable("Expected en.terms loader to throw 404 Response");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(404);
    }
  });

  it("rejects cookies FR and EN routes with 404 when published is null", async () => {
    try {
      await frCookiesLoader();
      expect.unreachable("Expected fr.cookies loader to throw 404 Response");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(404);
    }

    try {
      await enCookiesLoader();
      expect.unreachable("Expected en.cookies loader to throw 404 Response");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      expect(response.status).toBe(404);
    }
  });

  it("includes X-Robots-Tag: noindex, nofollow on 404 responses", async () => {
    const loaders = [
      frLegalLoader,
      enLegalLoader,
      frPrivacyLoader,
      enPrivacyLoader,
      frCgvLoader,
      enTermsLoader,
      frCookiesLoader,
      enCookiesLoader,
    ];

    for (const loaderFn of loaders) {
      try {
        await loaderFn();
        expect.unreachable("Expected loader to throw Response");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Response);
        const response = error as Response;
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      }
    }
  });

  it("includes Cache-Control: no-store on 404 responses", async () => {
    const loaders = [
      frLegalLoader,
      enLegalLoader,
      frPrivacyLoader,
      enPrivacyLoader,
      frCgvLoader,
      enTermsLoader,
      frCookiesLoader,
      enCookiesLoader,
    ];

    for (const loaderFn of loaders) {
      try {
        await loaderFn();
        expect.unreachable("Expected loader to throw Response");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Response);
        const response = error as Response;
        expect(response.headers.get("Cache-Control")).toBe("no-store");
      }
    }
  });

  it("propagates security and cache headers through route headers() function", () => {
    const errorHeaders = new Headers(LEGAL_404_HEADERS);

    const headersFns = [
      frLegalHeaders,
      enLegalHeaders,
      frPrivacyHeaders,
      enPrivacyHeaders,
      frCgvHeaders,
      enTermsHeaders,
      frCookiesHeaders,
      enCookiesHeaders,
    ];

    for (const headersFn of headersFns) {
      const hdrs = headersFn({
        errorHeaders,
        loaderHeaders: new Headers(),
        parentHeaders: new Headers(),
        actionHeaders: new Headers(),
      } as unknown as Parameters<typeof headersFn>[0]);

      expect(hdrs.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(hdrs.get("Cache-Control")).toBe("no-store");
    }
  });

  it("ensures a unique sentence present only in draft never appears in public responses or sanitized root data", async () => {
    const content = getSiteContent();
    const draftIntroFr = content.legalPages.mentions.draft.intro.fr;
    expect(draftIntroFr.length).toBeGreaterThan(10);

    expect(EMPTY_LEGAL_DOCUMENT.sections.length).toBe(0);
    expect(EMPTY_LEGAL_DOCUMENT.effectiveDate).toBeNull();
    expect(EMPTY_LEGAL_DOCUMENT.version).toBe(0);

    // 1. getPublishedLegalDocument must never return the draft
    expect(() => getPublishedLegalDocument("mentions")).toThrow();

    // 2. Sanitized site content for root loader strips all draft text
    const sanitized = sanitizeSiteContentForPublic(content);
    const keys: LegalPageKey[] = ["mentions", "privacy", "cgv", "cookies"];
    for (const k of keys) {
      expect(sanitized.legalPages[k].draft.intro.fr).toBe("");
      expect(sanitized.legalPages[k].draft.intro.en).toBe("");
      expect(sanitized.legalPages[k].draft.seoTitle.fr).toBe("");
      expect(sanitized.legalPages[k].draft.seoDescription.fr).toBe("");
      expect(sanitized.legalPages[k].draft.sections.length).toBe(0);
      expect(sanitized.legalPages[k].history.length).toBe(0);
    }

    const serializedSanitized = JSON.stringify(sanitized);
    expect(serializedSanitized).not.toContain(draftIntroFr);

    // 3. 404 response body thrown by loader does not contain draft phrase
    try {
      await frLegalLoader();
    } catch (error: unknown) {
      const response = error as Response;
      const text = await response.text();
      expect(text).not.toContain(draftIntroFr);
    }
  });

  it("ensures metadata never uses draft when document is unpublished", () => {
    const content = getSiteContent();
    const draftSeoTitles = [
      content.legalPages.mentions.draft.seoTitle.fr,
      content.legalPages.privacy.draft.seoTitle.fr,
      content.legalPages.cgv.draft.seoTitle.fr,
      content.legalPages.cookies.draft.seoTitle.fr,
    ];

    const testMetaNoindex = (tags: ReturnType<typeof frLegalMeta>) => {
      expect(tags).toContainEqual({ name: "robots", content: "noindex, nofollow" });
      const tagsStr = JSON.stringify(tags);
      for (const title of draftSeoTitles) {
        expect(tagsStr).not.toContain(title);
      }
    };

    const emptyArgs = {
      loaderData: undefined,
      matches: mockMatches,
      params: {},
      location: mockLocation,
    };

    testMetaNoindex(frLegalMeta(emptyArgs as unknown as Parameters<typeof frLegalMeta>[0]));
    testMetaNoindex(enLegalMeta(emptyArgs as unknown as Parameters<typeof enLegalMeta>[0]));
    testMetaNoindex(frPrivacyMeta(emptyArgs as unknown as Parameters<typeof frPrivacyMeta>[0]));
    testMetaNoindex(enPrivacyMeta(emptyArgs as unknown as Parameters<typeof enPrivacyMeta>[0]));
    testMetaNoindex(frCgvMeta(emptyArgs as unknown as Parameters<typeof frCgvMeta>[0]));
    testMetaNoindex(enTermsMeta(emptyArgs as unknown as Parameters<typeof enTermsMeta>[0]));
    testMetaNoindex(frCookiesMeta(emptyArgs as unknown as Parameters<typeof frCookiesMeta>[0]));
    testMetaNoindex(enCookiesMeta(emptyArgs as unknown as Parameters<typeof enCookiesMeta>[0]));
  });

  it("renders published document correctly when a published version exists", () => {
    const mockPublishedDoc: LegalDocument = {
      version: 1,
      effectiveDate: "2026-10-23",
      lastModified: "2026-10-23T10:00:00.000Z",
      seoTitle: { fr: "Titre SEO Publie", en: "Published SEO Title" },
      seoDescription: { fr: "Description SEO Publiee", en: "Published SEO Description" },
      publicTitle: { fr: "Mentions Legales Publiees", en: "Published Legal Notice" },
      intro: { fr: "Introduction officielle publiee.", en: "Official published introduction." },
      sections: [
        {
          id: "published-section",
          title: { fr: "Section Publiee 1", en: "Published Section 1" },
          paragraphs: [{ fr: "Contenu certifie conforme.", en: "Certified compliant content." }],
        },
      ],
    };

    const { container } = render(
      <FrLegalRoute
        loaderData={{ document: mockPublishedDoc }}
        params={{}}
        matches={mockMatches as unknown as Parameters<typeof FrLegalRoute>[0]["matches"]}
      />
    );

    expect(container.textContent).toContain("Mentions Legales Publiees");
    expect(container.textContent).toContain("Introduction officielle publiee.");
    expect(container.textContent).toContain("Contenu certifie conforme.");
    expect(screen.queryByText(/Brouillon en cours/i)).toBeNull();

    // Verify all 8 route components render with published document
    const enLegal = render(<EnLegalRoute loaderData={{ document: mockPublishedDoc }} params={{}} matches={mockMatches as unknown as Parameters<typeof EnLegalRoute>[0]["matches"]} />);
    expect(enLegal.container.textContent).toContain("Published Legal Notice");

    const frPrivacy = render(<FrPrivacyRoute loaderData={{ document: mockPublishedDoc }} params={{}} matches={mockMatches as unknown as Parameters<typeof FrPrivacyRoute>[0]["matches"]} />);
    expect(frPrivacy.container.textContent).toContain("Mentions Legales Publiees");

    const enPrivacy = render(<EnPrivacyRoute loaderData={{ document: mockPublishedDoc }} params={{}} matches={mockMatches as unknown as Parameters<typeof EnPrivacyRoute>[0]["matches"]} />);
    expect(enPrivacy.container.textContent).toContain("Published Legal Notice");

    const frCgv = render(<FrCgvRoute loaderData={{ document: mockPublishedDoc }} params={{}} matches={mockMatches as unknown as Parameters<typeof FrCgvRoute>[0]["matches"]} />);
    expect(frCgv.container.textContent).toContain("Mentions Legales Publiees");

    const enTerms = render(<EnTermsRoute loaderData={{ document: mockPublishedDoc }} params={{}} matches={mockMatches as unknown as Parameters<typeof EnTermsRoute>[0]["matches"]} />);
    expect(enTerms.container.textContent).toContain("Published Legal Notice");

    const frCookies = render(<FrCookiesRoute loaderData={{ document: mockPublishedDoc }} params={{}} matches={mockMatches as unknown as Parameters<typeof FrCookiesRoute>[0]["matches"]} />);
    expect(frCookies.container.textContent).toContain("Mentions Legales Publiees");

    const enCookies = render(<EnCookiesRoute loaderData={{ document: mockPublishedDoc }} params={{}} matches={mockMatches as unknown as Parameters<typeof EnCookiesRoute>[0]["matches"]} />);
    expect(enCookies.container.textContent).toContain("Published Legal Notice");
  });

  it("renders exclusively published version when draft and published differ", () => {
    const distinctPublishedDoc: LegalDocument = {
      version: 1,
      effectiveDate: "2026-10-23",
      lastModified: "2026-10-23T10:00:00.000Z",
      seoTitle: { fr: "SEO_PUBLISHED_EXCLUSIF", en: "SEO_PUBLISHED_EN" },
      seoDescription: { fr: "DESC_PUBLISHED_EXCLUSIF", en: "DESC_PUBLISHED_EN" },
      publicTitle: { fr: "TITRE_PUBLISHED_VISIBLE", en: "TITLE_PUBLISHED_EN" },
      intro: { fr: "PHRASE_PUBLISHED_CANONIQUE", en: "PHRASE_PUBLISHED_EN" },
      sections: [
        {
          id: "sec-pub",
          title: { fr: "SECTION_PUBLISHED_TITLE", en: "SECTION_PUBLISHED_TITLE_EN" },
          paragraphs: [{ fr: "PARAGRAPHE_PUBLISHED_BODY", en: "PARAGRAPHE_PUBLISHED_BODY_EN" }],
        },
      ],
    };

    const distinctDraftDoc: LegalDocument = {
      version: 0,
      effectiveDate: null,
      lastModified: "2026-10-23T09:00:00.000Z",
      seoTitle: { fr: "SEO_DRAFT_SECRET", en: "SEO_DRAFT_SECRET_EN" },
      seoDescription: { fr: "DESC_DRAFT_SECRET", en: "DESC_DRAFT_SECRET_EN" },
      publicTitle: { fr: "TITRE_DRAFT_SECRET", en: "TITLE_DRAFT_SECRET_EN" },
      intro: { fr: "PHRASE_DRAFT_CONFIDENTIELLE", en: "PHRASE_DRAFT_CONFIDENTIELLE_EN" },
      sections: [
        {
          id: "sec-draft",
          title: { fr: "SECTION_DRAFT_TITLE", en: "SECTION_DRAFT_TITLE_EN" },
          paragraphs: [{ fr: "PARAGRAPHE_DRAFT_BODY", en: "PARAGRAPHE_DRAFT_BODY_EN" }],
        },
      ],
    };

    // Public route receives only the published document
    const { container } = render(
      <FrLegalRoute
        loaderData={{ document: distinctPublishedDoc }}
        params={{}}
        matches={mockMatches as unknown as Parameters<typeof FrLegalRoute>[0]["matches"]}
      />
    );

    const publicContent = container.textContent || "";
    expect(publicContent).toContain("TITRE_PUBLISHED_VISIBLE");
    expect(publicContent).toContain("PHRASE_PUBLISHED_CANONIQUE");
    expect(publicContent).toContain("PARAGRAPHE_PUBLISHED_BODY");

    // Must never contain any secret draft content
    expect(publicContent).not.toContain("TITRE_DRAFT_SECRET");
    expect(publicContent).not.toContain("PHRASE_DRAFT_CONFIDENTIELLE");
    expect(publicContent).not.toContain("PARAGRAPHE_DRAFT_BODY");

    // Public meta tags must reflect published document and ignore draft
    const metaTags = frLegalMeta({
      loaderData: { document: distinctPublishedDoc },
      matches: mockMatches,
      params: {},
      location: mockLocation,
    } as unknown as Parameters<typeof frLegalMeta>[0]);

    const metaStr = JSON.stringify(metaTags);
    expect(metaStr).toContain("SEO_PUBLISHED_EXCLUSIF");
    expect(metaStr).not.toContain("SEO_DRAFT_SECRET");
    expect(metaStr).not.toContain(distinctDraftDoc.publicTitle.fr);
  });

  it("renders NotFound error boundary on route failure without exposing draft data", () => {
    mockLocationPath = "/fr/mentions-legales";
    const { container: frLegal } = render(<FrLegalErrorBoundary />);
    expect(frLegal.textContent).toContain("Cette page n'existe pas.");

    mockLocationPath = "/en/legal";
    const { container: enLegal } = render(<EnLegalErrorBoundary />);
    expect(enLegal.textContent).toContain("This page doesn't exist.");

    mockLocationPath = "/fr/confidentialite";
    const { container: frPriv } = render(<FrPrivacyErrorBoundary />);
    expect(frPriv.textContent).toContain("Cette page n'existe pas.");

    mockLocationPath = "/en/privacy";
    const { container: enPriv } = render(<EnPrivacyErrorBoundary />);
    expect(enPriv.textContent).toContain("This page doesn't exist.");

    mockLocationPath = "/fr/cgv";
    const { container: frCgv } = render(<FrCgvErrorBoundary />);
    expect(frCgv.textContent).toContain("Cette page n'existe pas.");

    mockLocationPath = "/en/terms";
    const { container: enTerms } = render(<EnTermsErrorBoundary />);
    expect(enTerms.textContent).toContain("This page doesn't exist.");

    mockLocationPath = "/fr/cookies";
    const { container: frCook } = render(<FrCookiesErrorBoundary />);
    expect(frCook.textContent).toContain("Cette page n'existe pas.");

    mockLocationPath = "/en/cookies";
    const { container: enCook } = render(<EnCookiesErrorBoundary />);
    expect(enCook.textContent).toContain("This page doesn't exist.");
  });

  it("preserves draft preview in admin embedded mode", () => {
    const content = getSiteContent();
    const draftDoc = content.legalPages.mentions.draft;

    const { container } = render(
      <LegalPageView
        mode="embedded"
        lang="fr"
        alternateLangHref="#"
        document={draftDoc}
        isDraft={true}
      />
    );

    // In embedded admin preview, the draft title and paragraphs MUST be displayed
    expect(container.textContent).toContain(draftDoc.publicTitle.fr);
    expect(container.textContent).toContain(draftDoc.intro.fr);
    // Warning notice should be present in draft mode
    expect(container.textContent).toContain("Brouillon non publié");
    expect(container.textContent).toContain("en cours de finalisation");
  });

  it("triggers no automatic publication when executing loaders or helpers", async () => {
    const beforeContent = getSiteContent();
    expect(beforeContent.legalPages.mentions.published).toBeNull();
    expect(beforeContent.legalPages.privacy.published).toBeNull();
    expect(beforeContent.legalPages.cgv.published).toBeNull();
    expect(beforeContent.legalPages.cookies.published).toBeNull();

    // Call all loaders and helper
    const loaders = [
      frLegalLoader,
      enLegalLoader,
      frPrivacyLoader,
      enPrivacyLoader,
      frCgvLoader,
      enTermsLoader,
      frCookiesLoader,
      enCookiesLoader,
    ];

    for (const l of loaders) {
      try {
        await l();
      } catch {
        // Expected 404 throw
      }
    }

    const afterContent = getSiteContent();
    expect(afterContent.legalPages.mentions.published).toBeNull();
    expect(afterContent.legalPages.privacy.published).toBeNull();
    expect(afterContent.legalPages.cgv.published).toBeNull();
    expect(afterContent.legalPages.cookies.published).toBeNull();
    expect(afterContent.revision).toBe(beforeContent.revision);
  });
});
