import { describe, it, expect } from "vitest";
import { meta as frCgvMeta } from "../app/routes/fr.cgv";
import { meta as enTermsMeta } from "../app/routes/en.terms";
import type { LegalDocument } from "../app/lib/site-content.server";

describe("CGV and Terms Meta Functions", () => {
  const mockPublishedDoc: LegalDocument = {
    version: 1,
    effectiveDate: "2026-10-23",
    lastModified: "2026-10-23T10:00:00.000Z",
    seoTitle: { fr: "CGV", en: "Terms" },
    seoDescription: { fr: "Desc FR", en: "Desc EN" },
    publicTitle: { fr: "Conditions Generales de Vente", en: "Terms and Conditions" },
    intro: { fr: "Intro FR", en: "Intro EN" },
    sections: [
      {
        id: "section-1",
        title: { fr: "Section 1", en: "Section 1" },
        paragraphs: [{ fr: "Para FR", en: "Para EN" }],
      },
    ],
  };

  const mockMatches = [
    {
      id: "root",
      pathname: "/",
      params: {},
      data: {
        PUBLIC_SITE_URL: "http://localhost:5173",
      },
      handle: undefined,
      loaderData: {
        PUBLIC_SITE_URL: "http://localhost:5173",
      },
    },
  ];

  it("returns correct metadata for /fr/cgv", () => {
    const metaTags = frCgvMeta({
      loaderData: { document: mockPublishedDoc },
      matches: mockMatches,
      params: {},
      location: { pathname: "/fr/cgv", search: "", hash: "", state: null, key: "test" },
    } as unknown as Parameters<typeof frCgvMeta>[0]);

    expect(metaTags).toContainEqual({ tagName: "link", rel: "canonical", href: "http://localhost:5173/fr/cgv" });
    expect(metaTags).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "fr", href: "http://localhost:5173/fr/cgv" });
    expect(metaTags).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "en", href: "http://localhost:5173/en/terms" });
    expect(metaTags).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "x-default", href: "http://localhost:5173/fr/cgv" });
  });

  it("returns correct metadata for /en/terms", () => {
    const metaTags = enTermsMeta({
      loaderData: { document: mockPublishedDoc },
      matches: mockMatches,
      params: {},
      location: { pathname: "/en/terms", search: "", hash: "", state: null, key: "test" },
    } as unknown as Parameters<typeof enTermsMeta>[0]);

    expect(metaTags).toContainEqual({ tagName: "link", rel: "canonical", href: "http://localhost:5173/en/terms" });
    expect(metaTags).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "en", href: "http://localhost:5173/en/terms" });
    expect(metaTags).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "fr", href: "http://localhost:5173/fr/cgv" });
    expect(metaTags).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "x-default", href: "http://localhost:5173/fr/cgv" });
  });
});
