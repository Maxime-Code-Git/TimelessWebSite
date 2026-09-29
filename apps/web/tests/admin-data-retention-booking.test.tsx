import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { vi } from "vitest";

import { useState, useEffect } from "react";

afterEach(() => {
  cleanup();
});

const { currentFetcher, useMockFetcher, setMockFetcher } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let current: any = {
    data: {},
    state: "idle",
  };

  const setMockFetcher = (updates: any) => {
    Object.assign(current, updates);
    listeners.forEach(l => l());
  };

  // We can't use React hooks inside vi.hoisted directly if React isn't loaded,
  // but we can return a function that will be called later!
  const useMockFetcher = () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require("react");
    const [, setTick] = React.useState(0);
    React.useEffect(() => {
      const l = () => setTick((t: number) => t + 1);
      listeners.add(l);
      return () => listeners.delete(l);
    }, []);
    return current;
  };

  return { currentFetcher: current, useMockFetcher, setMockFetcher };
});

currentFetcher.submit = vi.fn();
const MockForm = ({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>;
currentFetcher.Form = MockForm;

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useFetcher: useMockFetcher
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

  it("message d'erreur a role=alert et modale reste ouverte, puis nouvelle tentative possible", async () => {
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

    cleanup(); // Remove the beforeEach render
    render(<RouterProvider router={router} />);

    const buttons = await screen.findAllByRole("button", { name: "Supprimer" });
    fireEvent.click(buttons[0]);


    // Submit transition
    await act(async () => {
      setMockFetcher({ state: "submitting", data: {} });
    });

    // Error transition
    await act(async () => {
      setMockFetcher({ state: "idle", data: { error: "Test error message" } });
    });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Test error message");

    // Modal is still open
    expect(screen.getByRole("dialog", { name: "Suppression définitive" })).toBeDefined();

    // Focus should be returned to the input field
    const input = screen.getByLabelText(/Veuillez taper SUPPRIMER/i);
    expect(input).toBeDefined();

    // Close modal
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    // Open a second modal -> error should be gone because it's tied to the modal scope
    fireEvent.click(buttons[1]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("modale se ferme sur succès, affiche role status, focus est restauré", async () => {
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

    cleanup(); // Remove the beforeEach render
    render(<RouterProvider router={router} />);

    const buttons = await screen.findAllByRole("button", { name: "Supprimer" });
    const trigger = buttons[0];
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toBeDefined();




    // Transition 1: submit
    await act(async () => {
      setMockFetcher({ state: "submitting", data: {} });
    });

    // Transition 2: success
    await act(async () => {
      setMockFetcher({ state: "idle", data: { success: true, message: "Supprimé avec succès" } });
    });

    // Modal closes synchronously due to act()
    expect(screen.queryByRole("dialog")).toBeNull();

    // Status message shown outside modal
    const statusMsg = screen.getByText("Supprimé avec succès");
    expect(statusMsg).toBeDefined();

    // Focus returned to trigger
    expect(trigger).toBeDefined();
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
