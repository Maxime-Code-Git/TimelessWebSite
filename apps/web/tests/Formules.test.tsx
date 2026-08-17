import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import FormulesFr from "../app/routes/fr.formules";

describe("Formules Component", () => {
  it("renders Photo & Film category by default (Duo)", () => {
    render(
      <MemoryRouter>
        <FormulesFr />
      </MemoryRouter>
    );

    // Vérifie que le tab "Photo & Film" est sélectionné
    const activeTab = screen.getByRole("button", { name: "Photo & Film" });
    expect(activeTab).toHaveClass(/active/);

    // "200 photos + film court" is a feature of the Duo package
    expect(screen.getByText("200 photos + film court")).toBeInTheDocument();
  });

  it("switches categories when clicking tabs", () => {
    render(
      <MemoryRouter>
        <FormulesFr />
      </MemoryRouter>
    );

    const photoTab = screen.getByRole("button", { name: "Photographie" });
    fireEvent.click(photoTab);

    // Vérifie le changement de catégorie
    expect(photoTab).toHaveClass(/active/);

    // "200 photos livrées" is in Photo packages
    expect(screen.getByText("200 photos livrées")).toBeInTheDocument();
  });

  it("toggles FAQ accordion", () => {
    render(
      <MemoryRouter>
        <FormulesFr />
      </MemoryRouter>
    );

    // Clic on second FAQ question (closed by default)
    const questionBtn = screen.getByRole("button", { name: /Quel acompte pour réserver la date/i });

    // Fermé au début
    expect(questionBtn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Un acompte de réservation est demandé à la signature/i)).not.toBeInTheDocument();

    // Clic pour ouvrir
    fireEvent.click(questionBtn);
    expect(questionBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Un acompte de réservation est demandé à la signature/i)).toBeInTheDocument();

    // Clic pour fermer
    fireEvent.click(questionBtn);
    expect(questionBtn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Un acompte de réservation est demandé à la signature/i)).not.toBeInTheDocument();
  });
});
