import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("ContactPage Component", () => {
  it("renders correctly and shows unavailability message", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: <ContactPage lang="fr" />
      }
    ]);
    const { container } = render(<RouterProvider router={router} />);

    // Check form is rendered
    expect(screen.getByLabelText("Prénom(s) des futurs mariés")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeInTheDocument();

    // No undefined classes
    expect(container.innerHTML).not.toContain('class="undefined"');
  });
});
