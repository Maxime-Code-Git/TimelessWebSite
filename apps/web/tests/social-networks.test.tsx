import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, createMemoryRouter, RouterProvider } from "react-router";
import {
  isValidSocialUrl,
  getActiveSocialNetworks,
  SOCIAL_PLATFORMS,
  DEFAULT_SOCIAL_NETWORKS,
} from "../app/lib/social-networks";
import type { SocialNetworksState } from "../app/lib/social-networks";
import { validateSiteContent } from "../app/lib/site-content.server";
import defaultContent from "../app/content/default-site-content.json";
import { Footer } from "../app/components/layout/Footer";
import { ContactPage } from "../app/routes/ContactPage";
import AdminSettings from "../app/routes/admin.settings";
import contactStyles from "../app/routes/contact.module.css";

// Mock router hooks for Footer and ContactPage
let mockRootData: Record<string, unknown> = {
  siteContent: defaultContent,
};

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useRouteLoaderData: (id: string) => {
      if (id === "root") return mockRootData;
      return actual.useRouteLoaderData(id);
    },
  };
});

describe("Social Networks Validation and Registry", () => {
  it("validates official domains and subdomains for all 6 platforms", () => {
    expect(isValidSocialUrl("instagram", "https://instagram.com/sempra")).toBe(true);
    expect(isValidSocialUrl("instagram", "https://www.instagram.com/sempra/")).toBe(true);

    expect(isValidSocialUrl("facebook", "https://facebook.com/semprawedding")).toBe(true);
    expect(isValidSocialUrl("facebook", "https://www.facebook.com/semprawedding")).toBe(true);

    expect(isValidSocialUrl("youtube", "https://youtube.com/@sempra")).toBe(true);
    expect(isValidSocialUrl("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isValidSocialUrl("youtube", "https://youtu.be/dQw4w9WgXcQ")).toBe(true);

    expect(isValidSocialUrl("linkedin", "https://linkedin.com/company/sempra")).toBe(true);
    expect(isValidSocialUrl("linkedin", "https://www.linkedin.com/in/maxime-schneider")).toBe(true);

    expect(isValidSocialUrl("tiktok", "https://tiktok.com/@sempra")).toBe(true);
    expect(isValidSocialUrl("tiktok", "https://www.tiktok.com/@sempra")).toBe(true);

    expect(isValidSocialUrl("vimeo", "https://vimeo.com/123456789")).toBe(true);
    expect(isValidSocialUrl("vimeo", "https://player.vimeo.com/video/123456789")).toBe(true);
  });

  it("rejects non-HTTPS URLs", () => {
    expect(isValidSocialUrl("instagram", "http://instagram.com/sempra")).toBe(false);
    expect(isValidSocialUrl("youtube", "http://youtu.be/dQw4w9WgXcQ")).toBe(false);
  });

  it("rejects spoofed / deceptive domain names", () => {
    expect(isValidSocialUrl("instagram", "https://instagram.com.evil.com/sempra")).toBe(false);
    expect(isValidSocialUrl("facebook", "https://facebook.com.attacker.org/sempra")).toBe(false);
    expect(isValidSocialUrl("youtube", "https://youtu.be.phishing.io/abc")).toBe(false);
    expect(isValidSocialUrl("vimeo", "https://vimeo.com.attacker.com/123")).toBe(false);
  });

  it("rejects credentials embedded in the URL", () => {
    expect(isValidSocialUrl("instagram", "https://user:password@instagram.com/sempra")).toBe(false);
    expect(isValidSocialUrl("linkedin", "https://user@linkedin.com/in/test")).toBe(false);
  });

  it("rejects relative URLs and JavaScript protocols", () => {
    expect(isValidSocialUrl("instagram", "/sempra")).toBe(false);
    expect(isValidSocialUrl("instagram", "javascript:alert(1)")).toBe(false);
    expect(isValidSocialUrl("tiktok", "")).toBe(false);
  });

  it("rejects domain mismatching between platform and URL", () => {
    expect(isValidSocialUrl("instagram", "https://facebook.com/sempra")).toBe(false);
    expect(isValidSocialUrl("linkedin", "https://vimeo.com/123456")).toBe(false);
    expect(isValidSocialUrl("tiktok", "https://youtube.com/@sempra")).toBe(false);
  });

  it("filters active social networks correctly", () => {
    const testState: SocialNetworksState = {
      ...DEFAULT_SOCIAL_NETWORKS,
      instagram: { url: "https://instagram.com/sempra", enabled: true },
      facebook: { url: "https://facebook.com/sempra", enabled: false }, // disabled
      youtube: { url: "", enabled: true }, // invalid empty url
      linkedin: { url: "https://linkedin.com/company/sempra", enabled: true },
    };

    const active = getActiveSocialNetworks(testState);
    expect(active).toHaveLength(2);
    expect(active.map((a) => a.id)).toEqual(["instagram", "linkedin"]);
  });
});

describe("Server-Side Validation of Social Networks", () => {
  it("accepts valid social networks when saving site content", () => {
    const validContent = JSON.parse(JSON.stringify(defaultContent));
    validContent.business.socialNetworks = {
      instagram: { url: "https://instagram.com/semprawedding", enabled: true },
      facebook: { url: "https://facebook.com/semprawedding", enabled: true },
      youtube: { url: "https://youtube.com/@semprawedding", enabled: true },
      linkedin: { url: "https://linkedin.com/company/semprawedding", enabled: true },
      tiktok: { url: "https://tiktok.com/@semprawedding", enabled: true },
      vimeo: { url: "https://vimeo.com/123456", enabled: true },
    };

    const validated = validateSiteContent(validContent);
    expect(validated.business.socialNetworks.instagram.url).toBe("https://instagram.com/semprawedding");
    expect(validated.business.socialNetworks.instagram.enabled).toBe(true);
    expect(validated.business.socialNetworks.vimeo.enabled).toBe(true);
  });

  it("rejects an HTTP URL on an enabled platform", () => {
    const invalidContent = JSON.parse(JSON.stringify(defaultContent));
    invalidContent.business.socialNetworks.instagram = {
      url: "http://instagram.com/sempra",
      enabled: true,
    };
    expect(() => validateSiteContent(invalidContent)).toThrow(/invalide ou ne correspond pas au domaine/);
  });

  it("rejects a domain mismatch on an enabled platform", () => {
    const invalidContent = JSON.parse(JSON.stringify(defaultContent));
    invalidContent.business.socialNetworks.instagram = {
      url: "https://facebook.com/sempra",
      enabled: true,
    };
    expect(() => validateSiteContent(invalidContent)).toThrow(/invalide ou ne correspond pas au domaine/);
  });

  it("rejects unknown platform keys injected manually", () => {
    const invalidContent = JSON.parse(JSON.stringify(defaultContent));
    (invalidContent.business.socialNetworks as Record<string, unknown>).myspace = {
      url: "https://myspace.com/sempra",
      enabled: true,
    };
    expect(() => validateSiteContent(invalidContent)).toThrow();
  });

  it("rejects unexpected fields in platform object", () => {
    const invalidContent = JSON.parse(JSON.stringify(defaultContent));
    (invalidContent.business.socialNetworks.instagram as Record<string, unknown>).extraField = "hack";
    expect(() => validateSiteContent(invalidContent)).toThrow();
  });

  it("rejects enabled platform with empty URL", () => {
    const invalidContent = JSON.parse(JSON.stringify(defaultContent));
    invalidContent.business.socialNetworks.instagram = {
      url: "",
      enabled: true,
    };
    expect(() => validateSiteContent(invalidContent)).toThrow(/requise lorsqu'elle est activée/);
  });
});

describe("Admin Settings Focus Management", () => {
  it("maintains focus during multiple keystrokes in social network URL inputs", async () => {
    const loaderData = {
      business: defaultContent.business,
      revision: "rev1",
      csrfToken: "csrf123",
      storageWarning: false,
    };

    const router = createMemoryRouter([
      {
        path: "/",
        element: <AdminSettings />,
        loader: () => loaderData,
      },
    ]);

    render(<RouterProvider router={router} />);

    // Find the Instagram URL input
    const instagramInput = await screen.findByLabelText(/URL Instagram/i);
    expect(instagramInput).toBeInTheDocument();

    instagramInput.focus();
    expect(instagramInput).toHaveFocus();

    fireEvent.change(instagramInput, { target: { value: "h" } });
    expect(instagramInput).toHaveFocus();
    expect(instagramInput).toHaveValue("h");

    fireEvent.change(instagramInput, { target: { value: "https://" } });
    expect(instagramInput).toHaveFocus();
    expect(instagramInput).toHaveValue("https://");

    fireEvent.change(instagramInput, { target: { value: "https://instagram.com/sempra" } });
    expect(instagramInput).toHaveFocus();
    expect(instagramInput).toHaveValue("https://instagram.com/sempra");
  });

  it("allows toggling platforms and maintains checkbox state", async () => {
    const loaderData = {
      business: defaultContent.business,
      revision: "rev1",
      csrfToken: "csrf123",
      storageWarning: false,
    };

    const router = createMemoryRouter([
      {
        path: "/",
        element: <AdminSettings />,
        loader: () => loaderData,
      },
    ]);

    render(<RouterProvider router={router} />);

    const instagramToggle = await screen.findByLabelText(/Afficher Instagram/i);
    expect(instagramToggle).not.toBeChecked();

    fireEvent.click(instagramToggle);
    expect(instagramToggle).toBeChecked();

    fireEvent.click(instagramToggle);
    expect(instagramToggle).not.toBeChecked();
  });
});

describe("Public Footer Social Networks Rendering", () => {
  it("does not render any social network block when no network is active", () => {
    mockRootData = {
      siteContent: {
        ...defaultContent,
        business: {
          ...defaultContent.business,
          socialNetworks: DEFAULT_SOCIAL_NETWORKS,
        },
      },
    };

    const { container } = render(
      <MemoryRouter>
        <Footer lang="fr" />
      </MemoryRouter>
    );

    // The socialRow div should NOT exist
    const socialNav = container.querySelector('[aria-label="Réseaux sociaux"]');
    expect(socialNav).toBeNull();
  });

  it("renders active social networks with target, rel and accessible label in Footer", () => {
    mockRootData = {
      siteContent: {
        ...defaultContent,
        business: {
          ...defaultContent.business,
          socialNetworks: {
            ...DEFAULT_SOCIAL_NETWORKS,
            instagram: { url: "https://instagram.com/semprawedding", enabled: true },
            youtube: { url: "https://youtube.com/@semprawedding", enabled: true },
            tiktok: { url: "https://tiktok.com/@semprawedding", enabled: false }, // disabled, must not appear
          },
        },
      },
    };

    render(
      <MemoryRouter>
        <Footer lang="fr" />
      </MemoryRouter>
    );

    const instaLink = screen.getByRole("link", { name: "Instagram" });
    expect(instaLink).toBeInTheDocument();
    expect(instaLink).toHaveAttribute("href", "https://instagram.com/semprawedding");
    expect(instaLink).toHaveAttribute("target", "_blank");
    expect(instaLink).toHaveAttribute("rel", "noopener noreferrer");

    const ytLink = screen.getByRole("link", { name: "YouTube" });
    expect(ytLink).toBeInTheDocument();
    expect(ytLink).toHaveAttribute("href", "https://youtube.com/@semprawedding");
    expect(ytLink).toHaveAttribute("target", "_blank");
    expect(ytLink).toHaveAttribute("rel", "noopener noreferrer");

    // TikTok is disabled, must not be rendered
    expect(screen.queryByRole("link", { name: "TikTok" })).toBeNull();
  });
});

describe("Public Contact Page Social Networks Rendering", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes("/api/booking")) {
        return Promise.resolve({
          json: () => Promise.resolve({ slots: [] }),
        });
      }
      return originalFetch(url);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders active social networks on French Contact page", async () => {
    mockRootData = {
      siteContent: {
        ...defaultContent,
        business: {
          ...defaultContent.business,
          socialNetworks: {
            ...DEFAULT_SOCIAL_NETWORKS,
            instagram: { url: "https://instagram.com/semprawedding", enabled: true },
            vimeo: { url: "https://vimeo.com/123456", enabled: true },
            facebook: { url: "https://facebook.com/sempra", enabled: false },
          },
        },
      },
    };

    const router = createMemoryRouter([
      { path: "/", element: <ContactPage lang="fr" /> },
    ]);
    const { container } = render(<RouterProvider router={router} />);
    const instaLinks = await screen.findAllByRole("link", { name: "Instagram" });
    expect(instaLinks.length).toBeGreaterThanOrEqual(1);

    const contactInstaLink = container.querySelector(`.${contactStyles.contactSocialLink}`);
    expect(contactInstaLink).toBeInTheDocument();
    expect(contactInstaLink).toHaveAttribute("href", "https://instagram.com/semprawedding");
    expect(contactInstaLink).toHaveAttribute("target", "_blank");
    expect(contactInstaLink).toHaveAttribute("rel", "noopener noreferrer");

    const vimeoLinks = screen.getAllByRole("link", { name: "Vimeo" });
    expect(vimeoLinks.length).toBeGreaterThanOrEqual(1);

    expect(screen.queryByRole("link", { name: "Facebook" })).toBeNull();
  });

  it("renders active social networks on English Contact page", async () => {
    mockRootData = {
      siteContent: {
        ...defaultContent,
        business: {
          ...defaultContent.business,
          socialNetworks: {
            ...DEFAULT_SOCIAL_NETWORKS,
            linkedin: { url: "https://linkedin.com/company/semprawedding", enabled: true },
          },
        },
      },
    };

    const router = createMemoryRouter([
      { path: "/", element: <ContactPage lang="en" /> },
    ]);
    const { container } = render(<RouterProvider router={router} />);

    const linkedinLinks = await screen.findAllByRole("link", { name: "LinkedIn" });
    expect(linkedinLinks.length).toBeGreaterThanOrEqual(1);

    const contactLinkedinLink = container.querySelector(`.${contactStyles.contactSocialLink}`);
    expect(contactLinkedinLink).toBeInTheDocument();
    expect(contactLinkedinLink).toHaveAttribute("href", "https://linkedin.com/company/semprawedding");
    expect(contactLinkedinLink).toHaveAttribute("target", "_blank");
    expect(contactLinkedinLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not render social block on Contact page when no network is active", async () => {
    mockRootData = {
      siteContent: {
        ...defaultContent,
        business: {
          ...defaultContent.business,
          socialNetworks: DEFAULT_SOCIAL_NETWORKS,
        },
      },
    };

    const router = createMemoryRouter([
      { path: "/", element: <ContactPage lang="fr" /> },
    ]);
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      for (const platform of SOCIAL_PLATFORMS) {
        expect(screen.queryByRole("link", { name: platform.name })).toBeNull();
      }
    });
  });
});
