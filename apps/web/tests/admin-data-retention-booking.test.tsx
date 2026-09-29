import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DataRetentionPage from "../app/routes/admin.data-retention";
import { createMemoryRouter, RouterProvider } from "react-router";

describe("Admin Data Retention Booking React UI", () => {
  const mockBookings = [
    { id: "book-1", names: "John Doe", email: "john@test.com", status: "cancelled", local_date: "2024-01-01", local_time: "10:00" },
    { id: "book-2", names: "Jane Doe", email: "jane@test.com", status: "confirmed", local_date: "2024-02-01", local_time: "14:00" },
  ];

  beforeEach(() => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: <DataRetentionPage />,
        loader: () => ({
          bookings: mockBookings,
          galleries: [],
          csrfToken: "mock-csrf",
          q: ""
        })
      }
    ]);
    render(<RouterProvider router={router} />);
  });

  it("présence de la page de conservation", async () => {
    expect(await screen.findByRole("heading", { name: "Conservation et suppression des données" })).toBeDefined();
    expect(screen.getByText("Espace administrateur - RGPD")).toBeDefined();
  });

  it("recherche des rendez-vous", async () => {
    const input = await screen.findByLabelText(/Email, Nom, ID/i);
    expect(input).toBeDefined();
    
    // Check if bookings are rendered
    expect(screen.getByText("John Doe")).toBeDefined();
    expect(screen.getByText("Jane Doe")).toBeDefined();
  });

  it("modale accessible, focus initial et retour du focus, fermeture Escape, obligation SUPPRIMER", async () => {
    // Click on delete button for John Doe
    const buttons = await screen.findAllByRole("button", { name: "Supprimer" });
    const deleteJohn = buttons[0];
    
    // Verify it doesn't have class="undefined"
    expect(deleteJohn.className).not.toContain("undefined");

    fireEvent.click(deleteJohn);

    // Modal appears
    const dialog = screen.getByRole("dialog", { name: "Suppression définitive" });
    expect(dialog).toBeDefined();

    // Initial focus on confirm input
    const input = screen.getByLabelText(/Veuillez taper SUPPRIMER/i);
    expect(input).toHaveFocus();

    // Form doesn't submit without typing "SUPPRIMER" properly
    expect(input).toHaveProperty("required", true);
    
    // Close with escape
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    // Focus returns to trigger button
    expect(deleteJohn).toHaveFocus();
  });

  it("absence de styles inline", async () => {
    const section = (await screen.findByRole("heading", { name: "Recherche de rendez-vous" })).parentElement;
    expect(section?.getAttribute("style")).toBeNull();
  });
});
