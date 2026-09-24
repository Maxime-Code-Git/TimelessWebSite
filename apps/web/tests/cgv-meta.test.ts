import { describe, it, expect } from "vitest";
import { meta as frCgvMeta } from "../app/routes/fr.cgv";
import { meta as enTermsMeta } from "../app/routes/en.terms";

describe("CGV and Terms Meta Functions", () => {
  const mockMatches = [
    {
      id: "root",
      loaderData: {
        PUBLIC_SITE_URL: "http://localhost:5173",
        siteContent: {
          legalPages: {
            cgv: {
              published: {
                seoTitle: { fr: "CGV", en: "Terms" },
                seoDescription: { fr: "Desc FR", en: "Desc EN" }
              }
            }
          }
        }
      }
    }
  ];

  it("returns correct metadata for /fr/cgv", () => {
    const metaTags = frCgvMeta({ matches: mockMatches } as unknown as Parameters<typeof frCgvMeta>[0]);
    
    expect(metaTags).toContainEqual({ tagName: "link", rel: "canonical", href: "http://localhost:5173/fr/cgv" });
    expect(metaTags).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "fr", href: "http://localhost:5173/fr/cgv" });
    expect(metaTags).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "en", href: "http://localhost:5173/en/terms" });
    expect(metaTags).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "x-default", href: "http://localhost:5173/fr/cgv" });
  });

  it("returns correct metadata for /en/terms", () => {
    const metaTags = enTermsMeta({ matches: mockMatches } as unknown as Parameters<typeof enTermsMeta>[0]);
    
    expect(metaTags).toContainEqual({ tagName: "link", rel: "canonical", href: "http://localhost:5173/en/terms" });
    expect(metaTags).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "en", href: "http://localhost:5173/en/terms" });
    expect(metaTags).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "fr", href: "http://localhost:5173/fr/cgv" });
    expect(metaTags).toContainEqual({ tagName: "link", rel: "alternate", hrefLang: "x-default", href: "http://localhost:5173/fr/cgv" });
  });
});
