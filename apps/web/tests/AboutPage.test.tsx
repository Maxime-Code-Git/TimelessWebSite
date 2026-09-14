import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AboutPage } from "../app/routes/AboutPage";
import { useRouteLoaderData, MemoryRouter } from "react-router";
import "@testing-library/jest-dom";

// Mock react-router
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    useRouteLoaderData: vi.fn(),
  };
});

const mockContent = {
  aboutPage: {
    seo: {
      title: { fr: "SEO FR", en: "SEO EN" },
      description: { fr: "Desc FR", en: "Desc EN" },
    },
    hero: {
      title: { fr: "Hero FR", en: "Hero EN" },
      subtitle: { fr: "Hero Sub FR", en: "Hero Sub EN" },
    },
    team: {
      name: { fr: "Team Name FR", en: "Team Name EN" },
      role: { fr: "Role FR", en: "Role EN" },
      bio: { fr: "Bio FR", en: "Bio EN" },
      image: {
        imageId: null,
        alt: { fr: "Alt FR", en: "Alt EN" },
        variants: [],
      },
    },
    approach: {
      title: { fr: "Approach FR", en: "Approach EN" },
      principles: [
        { id: "1", title: { fr: "P1 FR", en: "P1 EN" }, text: { fr: "T1 FR", en: "T1 EN" } },
      ],
    },
    difference: {
      title: { fr: "Diff FR", en: "Diff EN" },
      text: { fr: "Diff Text FR", en: "Diff Text EN" },
    },
  },
};

describe("AboutPage Component", () => {
  beforeEach(() => {
    vi.mocked(useRouteLoaderData).mockReturnValue({ siteContent: mockContent });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders correctly in FR without image", () => {
    render(
      <MemoryRouter>
        <AboutPage lang="fr" />
      </MemoryRouter>
    );

    expect(screen.getByText("Hero FR")).toBeInTheDocument();
    expect(screen.getByText("Hero Sub FR")).toBeInTheDocument();
    expect(screen.getByText("Team Name FR")).toBeInTheDocument();
    expect(screen.getByText("Bio FR")).toBeInTheDocument();
    expect(screen.getByText("Approach FR")).toBeInTheDocument();
    expect(screen.getByText("P1 FR")).toBeInTheDocument();
    expect(screen.getByText("Diff FR")).toBeInTheDocument();
    expect(screen.getByText("Diff Text FR")).toBeInTheDocument();

    // The fallback personPhoto div should be present since there is no image
    expect(screen.queryByAltText("Alt FR")).not.toBeInTheDocument();
  });

  it("renders correctly in EN without image", () => {
    render(
      <MemoryRouter>
        <AboutPage lang="en" />
      </MemoryRouter>
    );

    expect(screen.getByText("Hero EN")).toBeInTheDocument();
    expect(screen.getByText("Team Name EN")).toBeInTheDocument();
    expect(screen.getByText("Diff EN")).toBeInTheDocument();
  });

  it("renders the picture element when image is present", () => {
    const contentWithImage = JSON.parse(JSON.stringify(mockContent));
    contentWithImage.aboutPage.team.image.imageId = "test-image-id";
    contentWithImage.aboutPage.team.image.alt = { fr: "Alt FR Mod", en: "Alt EN Mod" };
    contentWithImage.aboutPage.team.image.width = 800;
    contentWithImage.aboutPage.team.image.height = 1000;

    vi.mocked(useRouteLoaderData).mockReturnValue({ siteContent: contentWithImage });

    render(
      <MemoryRouter>
        <AboutPage lang="fr" />
      </MemoryRouter>
    );

    const img = screen.getByAltText("Alt FR Mod");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("width", "800");
    expect(img).toHaveAttribute("height", "1000");
    expect(img).toHaveAttribute("src", expect.stringContaining("test-image-id"));
    expect(img).toHaveAttribute("loading", "lazy");
  });
});
