import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ContactPage } from "../app/routes/ContactPage";
import defaultContent from "../app/content/default-site-content.json";

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useRouteLoaderData: (routeId: string) => {
      if (routeId === "root") return { siteContent: defaultContent };
      return actual.useRouteLoaderData(routeId);
    }
  };
});

const originalFetch = global.fetch;

describe("ContactPage Component", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/booking") {
        return Promise.resolve({
          json: () => Promise.resolve({ slots: [{ date: "2024-12-01", time: "10:00", slot_key: "key1" }] })
        });
      }
      return originalFetch(url);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("FR: renders forms with exact RGPD texts and privacy links", async () => {
    const router = createMemoryRouter([{ path: "/", element: <ContactPage lang="fr" /> }]);
    const { container } = render(<RouterProvider router={router} />);

    // Wait for the booking fetch to complete
    await waitFor(() => {
      expect(screen.getByLabelText("Choisissez une date :")).toBeInTheDocument();
    });

    // Select date and time to reveal the booking form
    fireEvent.change(screen.getByLabelText("Choisissez une date :"), { target: { value: "2024-12-01" } });
    fireEvent.change(screen.getByLabelText("Choisissez un horaire :"), { target: { value: "10:00" } });

    // Check contact form RGPD notice
    expect(screen.getByText("Les informations transmises sont utilisées pour répondre à votre demande et préparer une éventuelle prestation.")).toBeInTheDocument();

    // Check visio form RGPD notice
    expect(screen.getByText("Les informations transmises sont utilisées pour traiter et organiser votre demande de rendez-vous.")).toBeInTheDocument();

    // Check privacy links (should be multiple: one for Visio, one for Contact)
    const links = screen.getAllByRole("link", { name: "Politique de confidentialité" });
    expect(links.length).toBeGreaterThanOrEqual(2);

    // Verify that all instances point to /fr/confidentialite
    expect(links[0]).toHaveAttribute("href", "/fr/confidentialite");
    expect(links[1]).toHaveAttribute("href", "/fr/confidentialite");

    // No undefined classes
    expect(container.innerHTML).not.toContain('class="undefined"');
  });

  it("EN: renders forms with exact RGPD texts and privacy links", async () => {
    const router = createMemoryRouter([{ path: "/", element: <ContactPage lang="en" /> }]);
    const { container } = render(<RouterProvider router={router} />);

    // Wait for the booking fetch to complete
    await waitFor(() => {
      expect(screen.getByLabelText("Select a date:")).toBeInTheDocument();
    });

    // Select date and time to reveal the booking form
    fireEvent.change(screen.getByLabelText("Select a date:"), { target: { value: "2024-12-01" } });
    fireEvent.change(screen.getByLabelText("Select a time:"), { target: { value: "10:00" } });

    // Check contact form RGPD notices
    expect(screen.getByText("The submitted information is used to answer your request and prepare a potential service.")).toBeInTheDocument();
    expect(screen.getByText("The submitted information is used to process and organize your appointment request.")).toBeInTheDocument();

    // Check privacy links
    const links = screen.getAllByRole("link", { name: "Privacy Policy" });
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links[0]).toHaveAttribute("href", "/en/privacy");
    expect(links[1]).toHaveAttribute("href", "/en/privacy");

    // No undefined classes
    expect(container.innerHTML).not.toContain('class="undefined"');
  });
});
