import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import GalleryFr from "../app/routes/fr.gallery";

describe("Gallery Component", () => {
  it("renders gallery and allows expanding photo list", () => {
    render(
      <MemoryRouter>
        <GalleryFr />
      </MemoryRouter>
    );

    // Initial state: 12 photos visible, "Voir plus" button
    expect(screen.getByText(/12 sur 24 photos/i)).toBeInTheDocument();
    
    const loadMoreBtn = screen.getByRole("button", { name: /Voir plus/i });
    fireEvent.click(loadMoreBtn);

    // Expanded state: 24 photos visible, "Afficher moins" button
    expect(screen.getByText(/24 sur 24 photos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Afficher moins/i })).toBeInTheDocument();
  });
});
