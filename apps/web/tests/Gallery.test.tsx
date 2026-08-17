import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { GalleryPage } from "../app/components/pages/GalleryPage";

describe("GalleryPage Presentation Component", () => {
  it("renders correctly with mock fixtures (FR)", () => {
    const { container, getByText } = render(
      <MemoryRouter>
        <GalleryPage lang="fr" />
      </MemoryRouter>
    );

    // Check that dummy fixture name is rendered
    expect(getByText("Camille & Antoine")).toBeInTheDocument();

    // Check that chapters are rendered
    expect(getByText("Préparatifs")).toBeInTheDocument();
    expect(getByText("Cérémonie")).toBeInTheDocument();

    // No undefined classes
    expect(container.innerHTML).not.toContain('class="undefined"');
  });

  it("renders correctly with mock fixtures (EN)", () => {
    const { container, getByText } = render(
      <MemoryRouter>
        <GalleryPage lang="en" />
      </MemoryRouter>
    );

    // Check English translations for chapters
    expect(getByText("Preparations")).toBeInTheDocument();

    expect(container.innerHTML).not.toContain('class="undefined"');
  });
});
