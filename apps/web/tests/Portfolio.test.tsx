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
