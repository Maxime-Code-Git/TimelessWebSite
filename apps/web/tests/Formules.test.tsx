import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import FormulesFr from "../app/routes/fr.formules";

describe("Formules Component", () => {
  it("renders Photo & Film category by default", () => {
    render(
      <MemoryRouter>
        <FormulesFr />
      </MemoryRouter>
    );

    // Vérifie que le tab "Photo & Film" est sélectionné
    const activeTab = screen.getByRole("tab", { selected: true });
    expect(activeTab).toHaveTextContent("Photo & Film");

    // "L'expérience intégrale" est une feature du Duo Prestige
    expect(screen.getByText("L'expérience intégrale, sans compromis.")).toBeInTheDocument();
  });

  it("switches categories when clicking tabs", () => {
    render(
      <MemoryRouter>
        <FormulesFr />
      </MemoryRouter>
    );

    const photoTab = screen.getByRole("tab", { name: "Photographie" });
    fireEvent.click(photoTab);

    // Vérifie le changement de catégorie
    expect(photoTab).toHaveAttribute("aria-selected", "true");
    // "Couverture photo complète du jour." est dans Photo Signature
    expect(screen.getByText("Couverture photo complète du jour.")).toBeInTheDocument();
  });

  it("toggles FAQ accordion", () => {
    render(
      <MemoryRouter>
        <FormulesFr />
      </MemoryRouter>
    );

    const questionBtn = screen.getByRole("button", { name: /Les déplacements sont-ils inclus \?/i });
    
    // Fermé au début
    expect(questionBtn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Les déplacements sont inclus dans un rayon/i)).not.toBeInTheDocument();

    // Clic pour ouvrir
    fireEvent.click(questionBtn);
    expect(questionBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Les déplacements sont inclus dans un rayon/i)).toBeInTheDocument();

    // Clic pour fermer
    fireEvent.click(questionBtn);
    expect(questionBtn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Les déplacements sont inclus dans un rayon/i)).not.toBeInTheDocument();
  });
});
