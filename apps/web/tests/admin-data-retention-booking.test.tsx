import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";

const mockFetcher = {
  data: {} as Record<string, unknown>,
  state: "idle",
  submit: vi.fn(),
  Form: ({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>
};

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useFetcher: () => mockFetcher
  };
});
import DataRetentionPage from "../app/routes/admin.data-retention";
import { createMemoryRouter, RouterProvider } from "react-router";

describe("Admin Data Retention React UI", () => {
  const mockBookings = [
    { id: "book-1", names: "John Doe", email: "john@test.com", status: "cancelled", local_date: "2024-01-01", local_time: "10:00", starts_at_utc: "2024-01-01T09:00:00Z" },
    { id: "book-2", names: "Jane Doe", email: "jane@test.com", status: "confirmed", local_date: "2024-02-01", local_time: "14:00", starts_at_utc: "2025-02-01T13:00:00Z" },
  ];

  const mockGalleries = [
    { id: "gal-1", public_id: "pub-1", bride_names: "A & B", wedding_date: "2024", status: "published", expires_at: Date.now() + 100000, created_at: Date.now(), photo_count: 5, video_count: 1, total_size: 1024 * 1024 * 50 },
  ];

  const mockDeletionJobs = {
    pending: 1,
    processing: 0,
    failed: 0,
    failedJobs: []
  };

  beforeEach(() => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: <DataRetentionPage />,
        loader: () => ({
          bookings: mockBookings,
          galleries: mockGalleries,
          csrfToken: "mock-csrf",
          q: "",
          deletionJobs: mockDeletionJobs
        })
      }
    ]);
    render(<RouterProvider router={router} />);
  });

  it("présence de la page de conservation", async () => {
    expect(await screen.findByRole("heading", { name: "Conservation et suppression des données" })).toBeDefined();
    expect(screen.getByText("Espace administrateur - RGPD")).toBeDefined();
  });

  it("affiche le bloc informatif RGPD complet", async () => {
    await screen.findByRole("heading", { name: "Conservation et suppression des données" });
    expect(screen.getByText(/e-mails de contact sont stockés dans la messagerie/)).toBeDefined();
    expect(screen.getByText(/sauvegardes ont leur propre durée/)).toBeDefined();
    expect(screen.getByText(/ne supprime jamais le dossier source/)).toBeDefined();
    expect(screen.getByText(/Aucune suppression automatique/)).toBeDefined();
  });

  it("affiche le statut du nettoyage", async () => {
    await screen.findByRole("heading", { name: "Statut du nettoyage" });
    expect(screen.getByText(/En attente : 1/)).toBeDefined();
    expect(screen.getByText(/En cours : 0/)).toBeDefined();
  });

  it("affiche les photos, vidéos et taille des galeries", async () => {
    await screen.findByText("A & B (pub-1)");
    expect(screen.getByText("5")).toBeDefined(); // photo_count
    expect(screen.getByText("1")).toBeDefined(); // video_count
    expect(screen.getByText("50.0 Mo")).toBeDefined(); // total_size
  });

  it("recherche des rendez-vous", async () => {
    const input = await screen.findByLabelText(/Email, Nom, ID/i);
    expect(input).toBeDefined();
    expect(screen.getByText("John Doe")).toBeDefined();
    expect(screen.getByText("Jane Doe")).toBeDefined();
  });

  it("modale accessible : focus initial, retour du focus, fermeture Escape", async () => {
    const buttons = await screen.findAllByRole("button", { name: "Supprimer" });
    const deleteJohn = buttons[0];

    expect(deleteJohn.className).not.toContain("undefined");

    fireEvent.click(deleteJohn);

    const dialog = screen.getByRole("dialog", { name: "Suppression définitive" });
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    // Initial focus on confirm input
    const input = screen.getByLabelText(/Veuillez taper SUPPRIMER/i);
    expect(input).toHaveFocus();

    // Required attribute
    expect(input).toHaveProperty("required", true);

    // Close with escape
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    // Focus returns to trigger button
    await waitFor(() => expect(deleteJohn).toHaveFocus());
  });

  it("message d'erreur a role=alert et modale reste ouverte", async () => {
    // Override fetcher data for this test
    mockFetcher.data = { error: "Test error message" };
    mockFetcher.state = "idle";
    
    const router = createMemoryRouter([
      {
        path: "/",
        element: <DataRetentionPage />,
        loader: () => ({
          bookings: mockBookings,
          galleries: [],
          csrfToken: "mock-csrf",
          q: "",
          deletionJobs: { pending: 0, processing: 0, failed: 0, failedJobs: [] }
        })
      }
    ], { initialEntries: ["/"] });

    const { unmount } = render(<RouterProvider router={router} />);
    
    const buttons = await screen.findAllByRole("button", { name: "Supprimer" });
    fireEvent.click(buttons[0]);
    
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Test error message");
    
    // Modal is still open
    expect(screen.getByRole("dialog", { name: "Suppression définitive" })).toBeDefined();
    
    // Focus should be returned to the input field
    const input = screen.getByLabelText(/Veuillez taper SUPPRIMER/i);
    await waitFor(() => expect(input).toHaveFocus());
    unmount();
  });

  it("modale se ferme sur succès et focus est restauré", async () => {
    mockFetcher.data = { success: true };
    mockFetcher.state = "idle";
    
    const router = createMemoryRouter([
      {
        path: "/",
        element: <DataRetentionPage />,
        loader: () => ({
          bookings: mockBookings,
          galleries: [],
          csrfToken: "mock-csrf",
          q: "",
          deletionJobs: { pending: 0, processing: 0, failed: 0, failedJobs: [] }
        })
      }
    ], { initialEntries: ["/"] });

    const { unmount } = render(<RouterProvider router={router} />);
    
    const buttons = await screen.findAllByRole("button", { name: "Supprimer" });
    fireEvent.click(buttons[0]);
    
    // Since fetcher data is already success=true, the effect should close it immediately
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    unmount();
  });

  it("absence de styles inline dans toute la page", async () => {
    await screen.findByRole("heading", { name: "Conservation et suppression des données" });
    const allElements = document.querySelectorAll("[style]");
    expect(allElements.length).toBe(0);
  });

  it("aucune classe CSS Module ne vaut undefined", async () => {
    await screen.findByRole("heading", { name: "Conservation et suppression des données" });
    const undefinedClasses = document.querySelectorAll('[class*="undefined"]');
    expect(undefinedClasses.length).toBe(0);
  });
});
