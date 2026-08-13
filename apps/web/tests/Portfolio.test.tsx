import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import PortfolioFr from "../app/routes/fr.portfolio";

describe("Portfolio Component", () => {
  it("renders all photos by default", () => {
    render(
      <MemoryRouter>
        <PortfolioFr />
      </MemoryRouter>
    );

    const buttons = screen.getAllByRole("button", { name: /agrandir la photo/i });
    expect(buttons.length).toBe(9); // 9 photos par défaut
  });

  it("filters photos by category", () => {
    render(
      <MemoryRouter>
        <PortfolioFr />
      </MemoryRouter>
    );

    // Clic sur le filtre "Cérémonie"
    const ceremonieFilter = screen.getByRole("button", { name: "Cérémonie" });
    fireEvent.click(ceremonieFilter);

    // Il y a 3 photos de cérémonie dans ALL_PHOTOS
    const buttons = screen.getAllByRole("button", { name: /agrandir la photo/i });
    expect(buttons.length).toBe(3);
  });

  it("opens and closes lightbox", () => {
    render(
      <MemoryRouter>
        <PortfolioFr />
      </MemoryRouter>
    );

    // Lightbox fermée au début
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Ouvrir la lightbox sur la première photo
    const firstPhoto = screen.getAllByRole("button", { name: /agrandir la photo/i })[0];
    fireEvent.click(firstPhoto);

    // Lightbox ouverte
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Fermer avec le bouton
    const closeBtn = screen.getByRole("button", { name: /fermer/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
