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
      const slot = screen.getByRole("button", { name: "10:00 – 10:30" });
      fireEvent.click(slot);
      
      // The confirmation button should be enabled
      const confirmBtn = screen.getByRole("button", { name: "Confirmer le rendez-vous" });
      expect(confirmBtn).not.toBeDisabled();
    }
  });

  it("does not simulate fake success on form submit", () => {
    render(
      <MemoryRouter>
        <ContactFr />
      </MemoryRouter>
    );

    // Fill required fields
    fireEvent.change(screen.getByLabelText(/Prénom\(s\) des futurs mariés/i), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText(/Adresse e-mail/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/Date du mariage/i), { target: { value: '2027-08-14' } });
    fireEvent.change(screen.getByLabelText(/Lieu \/ région du mariage/i), { target: { value: 'Paris' } });
    fireEvent.change(screen.getByLabelText(/Formule qui vous intéresse/i), { target: { value: 'photo-signature' } });
    fireEvent.change(screen.getByLabelText(/Votre message/i), { target: { value: 'Test message' } });

    const submitBtn = screen.getByRole("button", { name: "Envoyer" });
    fireEvent.click(submitBtn);

    // L'envoi doit afficher qu'il est simulé en dev, ou refuser, mais pas afficher un faux succès
    const formMessages = screen.getAllByText(/\[Mode Dev\]|indisponible/i);
    expect(formMessages.length).toBeGreaterThan(0);
  });
});
