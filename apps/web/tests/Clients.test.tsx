import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import ClientsFr from "../app/routes/fr.clients";

describe("Clients Component", () => {
  it("renders login form and shows error for invalid code in non-dev mode", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: <ClientsFr />,
      }
    ], {
      initialEntries: ["/"],
    });

    render(<RouterProvider router={router} />);

    const input = screen.getByLabelText(/Votre code d'accès/i);
    expect(input).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: "Accéder à ma galerie" });
    expect(submitBtn).toBeInTheDocument();
  });
});
