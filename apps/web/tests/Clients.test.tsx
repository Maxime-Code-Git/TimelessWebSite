import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import ClientsFr from "../app/routes/fr.clients";

describe("Clients Component", () => {
  it("renders login form and shows error for invalid code in non-dev mode", () => {
    render(
      <MemoryRouter>
        <ClientsFr />
      </MemoryRouter>
    );

    const input = screen.getByLabelText(/Votre code d'accès/i);
    fireEvent.change(input, { target: { value: 'INVALID' } });

    const submitBtn = screen.getByRole("button", { name: "Accéder à ma galerie" });
    fireEvent.click(submitBtn);

    expect(screen.getByText(/Connexion impossible/i)).toBeInTheDocument();
  });
});
