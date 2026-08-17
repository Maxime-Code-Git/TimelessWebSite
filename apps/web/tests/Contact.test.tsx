import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ContactPage } from "../app/routes/ContactPage";

describe("ContactPage Component", () => {
  it("renders correctly and shows unavailability message", () => {
    const { container } = render(
      <MemoryRouter>
        <ContactPage lang="fr" />
      </MemoryRouter>
    );

    // Unavailability message is shown (it appears twice on the page)
    const msgs = screen.getAllByText(/La réservation en ligne est temporairement/i);
    expect(msgs.length).toBeGreaterThan(0);

    // Check form is rendered
    expect(screen.getByLabelText("Prénom(s) des futurs mariés")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeInTheDocument();

    // No undefined classes
    expect(container.innerHTML).not.toContain('class="undefined"');
  });
});
