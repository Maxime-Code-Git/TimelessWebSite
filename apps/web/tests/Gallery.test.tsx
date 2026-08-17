import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { GalleryPage } from "../app/components/pages/GalleryPage";
import { FIXTURES } from "./gallery.fixtures";

describe("GalleryPage Presentation Component", () => {
  it("renders correctly with mock fixtures (FR)", () => {
    const { container, getByText } = render(
      <MemoryRouter>
        <GalleryPage
          lang="fr"
          galleryName={FIXTURES.galleryName}
          date={FIXTURES.dateFR}
          location={FIXTURES.location}
          intro={FIXTURES.introFR}
          signature={FIXTURES.signature}
          chapters={FIXTURES.chapters}
        />
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
        <GalleryPage
          lang="en"
          galleryName={FIXTURES.galleryName}
          date={FIXTURES.dateEN}
          location={FIXTURES.location}
          intro={FIXTURES.introEN}
          signature={FIXTURES.signature}
          chapters={FIXTURES.chapters}
        />
      </MemoryRouter>
    );

    // Check English translations for chapters
    expect(getByText("Preparations")).toBeInTheDocument();

    expect(container.innerHTML).not.toContain('class="undefined"');
  });
});
