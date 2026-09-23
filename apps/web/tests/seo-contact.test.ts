import { describe, it, expect } from "vitest";
import { meta as frMeta } from "../app/routes/fr.contact";
import { meta as enMeta } from "../app/routes/en.contact";
import type { Route as FrRoute } from "../app/routes/+types/fr.contact";
import type { Route as EnRoute } from "../app/routes/+types/en.contact";
import defaultContent from "../app/content/default-site-content.json";

describe("Contact Page SEO Metadata", () => {
  const getMockMatches = (content: unknown) => [
        {
      id: "root",
      pathname: "/",
      params: {},
      data: undefined,
      handle: undefined,
      loaderData: {
        PUBLIC_SITE_URL: "https://test.com",
        siteContent: content
      }
    }
  ] as unknown as FrRoute.MetaArgs["matches"];

  it("should use localized SEO for FR", () => {
    const customContent = JSON.parse(JSON.stringify(defaultContent));
    customContent.contactPage.seo.title.fr = "Titre personnalisé";
    customContent.contactPage.seo.description.fr = "Description personnalisée";

    const result = frMeta({
      location: { pathname: "/fr/contact", search: "", hash: "", state: null, key: "default" },
      params: {},
      data: undefined,
      matches: getMockMatches(customContent)
    } as unknown as FrRoute.MetaArgs);

    const titleMeta = result.find(m => "title" in m);
    const descMeta = result.find(m => "name" in m && m.name === "description");

    expect(titleMeta).toEqual({ title: "Titre personnalisé" });
    expect(descMeta).toEqual({ name: "description", content: "Description personnalisée" });
  });

  it("should use localized SEO for EN", () => {
    const customContent = JSON.parse(JSON.stringify(defaultContent));
    customContent.contactPage.seo.title.en = "Custom Title";
    customContent.contactPage.seo.description.en = "Custom Description";

    const result = enMeta({
      location: { pathname: "/en/contact", search: "", hash: "", state: null, key: "default" },
      params: {},
      data: undefined,
      matches: getMockMatches(customContent)
    } as unknown as EnRoute.MetaArgs);

    const titleMeta = result.find(m => "title" in m);
    const descMeta = result.find(m => "name" in m && m.name === "description");

    expect(titleMeta).toEqual({ title: "Custom Title" });
    expect(descMeta).toEqual({ name: "description", content: "Custom Description" });
  });

  it("should provide fallbacks if content is missing", () => {
    const result = enMeta({
      location: { pathname: "/en/contact", search: "", hash: "", state: null, key: "default" },
      params: {},
      data: undefined,
      matches: getMockMatches({}) // Empty content
    } as unknown as EnRoute.MetaArgs);

    const titleMeta = result.find(m => "title" in m);
    expect(titleMeta).toEqual({ title: "Contact us — Sempra" });
  });
});
