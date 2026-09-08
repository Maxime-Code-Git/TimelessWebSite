import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { PortfolioPage } from "../app/routes/PortfolioPage";
import type { PublicPortfolio, PublicCategory, PublicPortfolioPhoto } from "../app/lib/portfolio-content.server";

vi.mock("react-router", async importOriginal => {
  const module = await importOriginal<typeof import("react-router")>();
  return { ...module, useRouteLoaderData: () => undefined };
});

const makeCategory = (id: string, nameFr: string, nameEn: string): PublicCategory => ({
  id,
  name: { fr: nameFr, en: nameEn },
  slug: nameFr.toLowerCase(),
});

const makePhoto = (id: string, categoryId: string): PublicPortfolioPhoto => ({
  id,
  categorySlug: categoryId,
  alt: { fr: "Photo " + id, en: "Photo " + id },
  width: 800,
  height: 600,
  variants: [{ name: "480p", width: 480, height: 360 }],
});

const portfolio: PublicPortfolio = {
  categories: [
    makeCategory("cat-1", "Cérémonie", "Ceremony"),
    makeCategory("cat-2", "Portraits", "Portraits"),
  ],
  photos: [
    makePhoto("photo-1", "cérémonie"),
    makePhoto("photo-2", "portraits"),
    makePhoto("photo-3", "cérémonie"),
  ],
  video: null,
};

describe("Portfolio Component", () => {
  it("renders every published photo supplied by the loader", () => {
    const { container } = render(
      <MemoryRouter>
        <PortfolioPage lang="fr" portfolio={portfolio} />
      </MemoryRouter>
    );

    expect(container.querySelectorAll('[class*="photoWrap"]')).toHaveLength(3);
  });

  it("filters photos by category", () => {
    const { container } = render(
      <MemoryRouter>
        <PortfolioPage lang="fr" portfolio={portfolio} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Cérémonie" }));
    expect(container.querySelectorAll('[class*="photoWrap"]')).toHaveLength(2);
  });
});

describe("Portfolio Video Component", () => {
  it("sans vidéo : aucun lien #galerie-video, aucune section vidéo, aucun iframe", () => {
    const { container } = render(
      <MemoryRouter>
        <PortfolioPage lang="fr" portfolio={portfolio} />
      </MemoryRouter>
    );

    expect(screen.queryByRole("link", { name: "Vidéo" })).not.toBeInTheDocument();
    expect(container.querySelector('#galerie-video')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
  });

  it("avec vidéo (Vimeo) : iframe s'affiche", () => {
    const portfolioWithVimeo: PublicPortfolio = {
      ...portfolio,
      video: { provider: "vimeo", videoId: "123456789" },
    };

    const { container } = render(
      <MemoryRouter>
        <PortfolioPage lang="fr" portfolio={portfolioWithVimeo} />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Vidéo" })).toHaveAttribute("href", "#galerie-video");
    const videoSection = container.querySelector('#galerie-video');
    expect(videoSection).toBeInTheDocument();

    const playButton = screen.getByRole("button", { name: "Lire la vidéo" });
    expect(playButton).toBeInTheDocument();

    // Simulate user click to load the iframe
    fireEvent.click(playButton);

    const iframe = container.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("src", expect.stringContaining("player.vimeo.com/video/123456789"));
  });

  it("URL YouTube générée avec youtube-nocookie.com", () => {
    const portfolioWithYoutube: PublicPortfolio = {
      ...portfolio,
      video: { provider: "youtube", videoId: "dQw4w9WgXcQ" },
    };

    const { container } = render(
      <MemoryRouter>
        <PortfolioPage lang="en" portfolio={portfolioWithYoutube} />
      </MemoryRouter>
    );

    const playButton = screen.getByRole("button", { name: "Play video" });
    expect(playButton).toBeInTheDocument();
    fireEvent.click(playButton);

    const iframe = container.querySelector('iframe');
    expect(iframe).toHaveAttribute("src", expect.stringContaining("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"));
  });
});
