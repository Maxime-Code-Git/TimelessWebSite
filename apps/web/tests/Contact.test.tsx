import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router";
import ContactFr from "../app/routes/fr.contact";

describe("Contact Component", () => {
  it("allows selecting a day in the booking calendar", () => {
    render(
      <MemoryRouter>
        <ContactFr />
      </MemoryRouter>
    );

    // Initial state: no slot selected
    expect(screen.getByText("Sélectionnez d'abord un mardi ou un jeudi dans le calendrier.")).toBeInTheDocument();

    // The calendar should have some buttons for days.
    // Tuesdays and Thursdays are open. We find an enabled button.
    const buttons = screen.getAllByRole("button");
    const openDay = buttons.find(b => !b.hasAttribute("disabled") && !isNaN(Number(b.textContent)));

    if (openDay) {
      fireEvent.click(openDay);
      
      // Now slots should appear
      expect(screen.queryByText("Sélectionnez d'abord un mardi ou un jeudi dans le calendrier.")).not.toBeInTheDocument();
      expect(screen.getByText("Créneaux disponibles")).toBeInTheDocument();
      
      // Click a slot
      const slots = screen.getAllByRole("button").filter(b => b.className.includes("slotBtn"));
      if (slots.length > 0) {
        fireEvent.click(slots[0]);
      }
      
      // The confirmation button should be enabled
      const confirmBtn = screen.getByRole("button", { name: "Confirmer le rendez-vous" });
      expect(confirmBtn).not.toBeDisabled();
    }
  });
});
