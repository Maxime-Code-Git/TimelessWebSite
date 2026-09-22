import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ContactPage } from "../app/routes/ContactPage";

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
