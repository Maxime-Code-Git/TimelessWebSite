import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { LegalPageView } from "../app/components/legal/LegalPageView";
import { getSiteContent } from "../app/lib/site-content.server";
import defaultContent from "../app/content/default-site-content.json";

const mockBusiness = {
  legalName: "Sempra SRL",
  tradeName: "Sempra",
  legalForm: "Société à responsabilité limitée",
  address: "Chaussée d'Alsemberg 721, 1180 Uccle",
  email: "contact@sempra.be",
  phoneDisplay: "+32 477 86 37 42",
  phoneE164: "+32477863742",
  enterpriseNumber: "0123.456.789",
  vatNumber: "BE 0123.456.789",
  hostingProvider: "Infrastructure privée Sempra",
  hostingAddress: "Rue Interdite 99, 1000 Bruxelles",
  legalRepresentative: "Maxime Schneider",
  depositPercent: 30,
  instagramUrl: null,
  linkedinUrl: null,
  serviceArea: { fr: "Belgique", en: "Belgium" },
};

const mockLegalUI = defaultContent.legalUI;

let currentRouteData: Record<string, unknown> = {
  siteContent: {
    business: mockBusiness,
    legalUI: mockLegalUI,
  },
};

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useRouteLoaderData: () => currentRouteData,
    Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
      <a href={to} {...props}>{children}</a>
    ),
    NavLink: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
      <a href={to} {...props}>{children}</a>
    ),
  };
});

describe("LegalPageView Component Rendering", () => {
  const mentionsDoc = defaultContent.legalPages.mentions.draft;

  it("renders dynamic business identity and hosting exactly once without duplication", () => {
    currentRouteData = {
      siteContent: {
        business: mockBusiness,
        legalUI: mockLegalUI,
      },
    };

    const { container } = render(
      <LegalPageView
        mode="public"
        lang="fr"
        alternateLangHref="/en/legal"
        document={mentionsDoc}
        isDraft={true}
      />
    );

    const mainSection = container.querySelector("main");
    expect(mainSection).not.toBeNull();
    const mainText = mainSection?.textContent || "";

    // Count occurrences within main legal page content
    const addressMatches = (mainText.match(/Chaussée d'Alsemberg 721, 1180 Uccle/g) || []).length;
    expect(addressMatches).toBe(1);

    const emailMatches = (mainText.match(/contact@sempra\.be/g) || []).length;
    expect(emailMatches).toBe(1);

    const phoneMatches = (mainText.match(/\+32 477 86 37 42/g) || []).length;
    expect(phoneMatches).toBe(1);

    const hostMatches = (mainText.match(/Infrastructure privée Sempra/g) || []).length;
    expect(hostMatches).toBe(1);

    // Physical server address MUST NEVER be rendered
    expect(mainText).not.toContain("Rue Interdite 99");
  });

  it("renders accessible mailto and tel links with correct href attributes", () => {
    const { container } = render(
      <LegalPageView
        mode="public"
        lang="fr"
        alternateLangHref="/en/legal"
        document={mentionsDoc}
        isDraft={true}
      />
    );

    const mainSection = container.querySelector("main");
    expect(mainSection).not.toBeNull();

    const emailLink = mainSection?.querySelector('a[href^="mailto:"]');
    expect(emailLink).not.toBeNull();
    expect(emailLink?.getAttribute("href")).toBe("mailto:contact@sempra.be");
    expect(emailLink?.textContent).toBe("contact@sempra.be");

    const phoneLink = mainSection?.querySelector('a[href^="tel:"]');
    expect(phoneLink).not.toBeNull();
    expect(phoneLink?.getAttribute("href")).toBe("tel:+32477863742");
    expect(phoneLink?.textContent).toBe("+32 477 86 37 42");
  });

  it("does not render placeholder like [À définir] as real data when hostingProvider is null", () => {
    currentRouteData = {
      siteContent: {
        business: {
          ...mockBusiness,
          hostingProvider: null,
          hostingAddress: null,
        },
        legalUI: mockLegalUI,
      },
    };

    const { container } = render(
      <LegalPageView
        mode="public"
        lang="fr"
        alternateLangHref="/en/legal"
        document={mentionsDoc}
        isDraft={true}
      />
    );

    const fullText = container.textContent || "";
    // Should not render "Hébergé par [À définir]."
    expect(fullText).not.toContain("Hébergé par [À définir]");
    expect(fullText).not.toContain("Hébergé par À définir");
    expect(fullText).not.toContain("[To be defined]");
  });

  it("preserves embedded mode without rendering layout Header or Footer", () => {
    const { container } = render(
      <LegalPageView
        mode="embedded"
        lang="fr"
        alternateLangHref="/en/legal"
        document={mentionsDoc}
        isDraft={true}
      />
    );

    // Neither <header> nor <footer> elements should be rendered in embedded mode
    expect(container.querySelector("header")).toBeNull();
    expect(container.querySelector("footer")).toBeNull();
    // But main heading and content must still be present
    expect(screen.getByRole("heading", { level: 1, name: "Mentions légales" })).toBeDefined();
  });

  it("renders active site content business data dynamically from getSiteContent()", () => {
    const activeContent = getSiteContent();
    currentRouteData = {
      siteContent: activeContent,
    };

    const { container } = render(
      <LegalPageView
        mode="public"
        lang="fr"
        alternateLangHref="/en/legal"
        document={activeContent.legalPages.mentions.draft}
        isDraft={true}
      />
    );

    expect(container.textContent).toContain("Mentions légales");
    if (activeContent.business?.email) {
      expect(container.textContent).toContain(activeContent.business.email);
    }
  });
});
