import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import AdminLegal from "../app/routes/admin.legal";
import { createMemoryRouter, RouterProvider } from "react-router";

const mockContent = {
  business: {
    hostingProvider: "E2E Hosting",
    hostingAddress: "123 Hosting St",
    email: "contact@sempra.com",
    address: "123 Sempra St",
    enterpriseNumber: "E2E-123",
  },
  legalUI: {
    draftWarning: { fr: "Brouillon", en: "Draft" },
    hostedBy: { fr: "Hébergé par", en: "Hosted by" },
    toBeDefined: { fr: "[À définir]", en: "[To be defined]" },
    versionLabel: { fr: "Version", en: "Version" },
    effectiveDate: { fr: "Applicable à partir du", en: "Effective Date" },
    unpublishedDraft: { fr: "Brouillon", en: "Draft" },
    cookiesInventoryTitle: { fr: "Cookies", en: "Cookies" },
    cookiesInventoryEmpty: { fr: "Vide", en: "Empty" },
    cookieColName: { fr: "Nom", en: "Name" },
    cookieColProvider: { fr: "Fournisseur", en: "Provider" },
    cookieColCategory: { fr: "Catégorie", en: "Category" },
    cookieColPurpose: { fr: "Finalité", en: "Purpose" },
    cookieColDuration: { fr: "Durée", en: "Duration" },
  },
  legalPages: {
    mentions: {
      draft: {
        publicTitle: { fr: "Mentions FR", en: "Mentions EN" },
        seoTitle: { fr: "SEO FR", en: "SEO EN" },
        seoDescription: { fr: "Desc FR", en: "Desc EN" },
        intro: { fr: "Intro FR", en: "Intro EN" },
        sections: [],
      },
      published: {
        version: 2,
        effectiveDate: "2026-01-01",
        lastModified: "2026-01-01T12:00:00Z",
        publicTitle: { fr: "Mentions Publiées FR", en: "Mentions Publiées EN" },
        intro: { fr: "Intro", en: "Intro" },
        sections: [],
        inventory: [
          {
            id: "cookie-1",
            name: { fr: "CookieTestFR", en: "CookieTestEN" },
            provider: { fr: "FournisseurTest", en: "ProviderTest" },
            category: "Analytics",
            purpose: { fr: "FinalitéTest", en: "PurposeTest" },
            duration: { fr: "1 an", en: "1 year" },
          },
        ],
      },
      history: [
        {
          version: 1,
          effectiveDate: "2025-01-01",
          lastModified: "2025-01-01T12:00:00Z",
          publicTitle: { fr: "Mentions Archive FR", en: "Mentions Archive EN" },
          intro: { fr: "Intro", en: "Intro" },
          sections: [],
          inventory: [
            {
              id: "cookie-old",
              name: { fr: "OldCookieFR", en: "OldCookieEN" },
              provider: { fr: "OldProvider", en: "OldProvider" },
              category: "Marketing",
              purpose: { fr: "OldPurpose", en: "OldPurpose" },
              duration: { fr: "6 mois", en: "6 months" },
            },
          ],
        }
      ],
    },
    privacy: { draft: { publicTitle: { fr: "", en: "" }, intro: { fr: "", en: "" }, sections: [] }, history: [] },
    cgv: { draft: { publicTitle: { fr: "", en: "" }, intro: { fr: "", en: "" }, sections: [] }, history: [] },
    cookies: { draft: { publicTitle: { fr: "", en: "" }, intro: { fr: "", en: "" }, sections: [] }, history: [] },
  }
};

const mockUseLoaderData = vi.fn(() => ({
  content: mockContent,
  csrfToken: "mock-token",
  flashError: null,
  flashSuccess: null,
  business: mockContent.business
}));

 
vi.mock("react-router", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual: any = await importOriginal();
  return {
    ...actual,
    useLoaderData: () => mockUseLoaderData(),
    useRouteLoaderData: () => mockUseLoaderData(),
    useActionData: () => null,
    useNavigation: () => ({ state: "idle" }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Form: ({ children }: any) => <form>{children}</form>,
    useSubmit: () => vi.fn(),
  };
});

describe("AdminLegal React Component", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders full cookie inventory in history (current and archived)", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: <AdminLegal />,
      },
    ]);

    render(<RouterProvider router={router} />);
    
    // Check if the current published cookie is rendered in detail
    expect(screen.getAllByText(/CookieTestFR/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/FournisseurTest/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Analytics/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/FinalitéTest/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 an/).length).toBeGreaterThan(0);

    // Check if the archived cookie is rendered in detail
    expect(screen.getAllByText(/OldCookieFR/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/OldProvider/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Marketing/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/OldPurpose/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/6 mois/).length).toBeGreaterThan(0);
  });
});
