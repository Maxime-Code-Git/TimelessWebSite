import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { PortfolioPage } from "../app/routes/PortfolioPage";
import type { PublicPortfolioProject } from "../app/lib/portfolio-content.server";

vi.mock("react-router", async importOriginal => {
  const module = await importOriginal<typeof import("react-router")>();
  return { ...module, useRouteLoaderData: () => undefined };
});

const makeProject = (
  id: string,
  category: "ceremony" | "portraits" | "reception"
): PublicPortfolioProject => ({
  id,
  slug: { fr: "projet-" + id, en: "project-" + id },
  title: { fr: "Projet " + id, en: "Project " + id },
  description: { fr: "Description", en: "Description" },
  location: null,
  date: null,
  video: null,
  coverPhotoId: "photo-" + id,
  photos: [{
    id: "photo-" + id,
    category,
    alt: { fr: "Photo " + id, en: "Photo " + id },
    width: 800,
    height: 600,
    variants: [{ name: "480p", width: 480, height: 360 }],
  }],
});

const projects = [
  makeProject("un", "ceremony"),
  makeProject("deux", "portraits"),
  makeProject("trois", "reception"),
];

describe("Portfolio Component", () => {
  it("renders every published project supplied by the loader", () => {
    const { container } = render(
      <MemoryRouter>
        <PortfolioPage lang="fr" projects={projects} />
      </MemoryRouter>
    );

    expect(container.querySelectorAll('[class*="photoWrap"]')).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Projet un" })).toHaveAttribute(
      "href",
      "/fr/portfolio/projet-un"
    );
  });

  it("filters projects by the categories of their photos", () => {
    const { container } = render(
      <MemoryRouter>
        <PortfolioPage lang="fr" projects={projects} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Cérémonie" }));
    expect(container.querySelectorAll('[class*="photoWrap"]')).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Projet un" })).toBeInTheDocument();
  });
});

describe("Portfolio Video Component", () => {
  it("sans vidéo : aucun lien #galerie-video, aucune section vidéo, aucun iframe", () => {
    const { container } = render(
      <MemoryRouter>
        <PortfolioPage lang="fr" projects={[makeProject("novideo", "ceremony")]} />
      </MemoryRouter>
    );

    expect(screen.queryByRole("link", { name: "Vidéo" })).not.toBeInTheDocument();
    expect(container.querySelector('#galerie-video')).not.toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
  });

  it("avec vidéo (Vimeo) : bouton de lecture présent, aucun iframe avant clic, iframe créée après clic", () => {
    const project = makeProject("withvimeo", "ceremony");
    project.video = { provider: "vimeo", videoId: "123456789" };

    const { container } = render(
      <MemoryRouter>
        <PortfolioPage lang="fr" projects={[project]} />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Vidéo" })).toHaveAttribute("href", "#galerie-video");
    const videoSection = container.querySelector('#galerie-video');
    expect(videoSection).toBeInTheDocument();

    // No iframe initially
    expect(container.querySelector('iframe')).not.toBeInTheDocument();

    // Click play
    const playButton = screen.getByRole("button", { name: "Lire la vidéo" });
    fireEvent.click(playButton);

    // Iframe appears
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("src", expect.stringContaining("player.vimeo.com/video/123456789"));
  });

  it("URL YouTube générée avec youtube-nocookie.com", () => {
    const project = makeProject("withyoutube", "ceremony");
    project.video = { provider: "youtube", videoId: "dQw4w9WgXcQ" };

    const { container } = render(
      <MemoryRouter>
        <PortfolioPage lang="en" projects={[project]} />
      </MemoryRouter>
    );

    const playButton = screen.getByRole("button", { name: "Play video" });
    fireEvent.click(playButton);

    const iframe = container.querySelector('iframe');
    expect(iframe).toHaveAttribute("src", expect.stringContaining("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"));
  });
});
