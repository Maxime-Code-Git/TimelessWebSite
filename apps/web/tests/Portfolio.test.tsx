import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router";
import PortfolioFr from "../app/routes/fr.portfolio";
import defaultContent from "../app/content/default-site-content.json";

vi.mock("react-router", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router")>();
  return {
    ...mod,
    useRouteLoaderData: () => ({ siteContent: defaultContent })
  };
});

describe("Portfolio Component", () => {
  it("renders all photos by default", () => {
    const { container } = render(
      <MemoryRouter>
        <PortfolioFr />
      </MemoryRouter>
    );

    // Look for the photo wrap elements
    const photos = container.querySelectorAll('[class*="photoWrap"]');
    expect(photos.length).toBe(9); // 9 photos by default
  });

  it("filters photos by category", () => {
    const { container } = render(
      <MemoryRouter>
        <PortfolioFr />
      </MemoryRouter>
    );

    // Click on "Cérémonie"
    const ceremonieFilter = screen.getByRole("button", { name: "Cérémonie" });
    fireEvent.click(ceremonieFilter);

    // After filtering there should be 3 photos
    const photos = container.querySelectorAll('[class*="photoWrap"]');
    expect(photos.length).toBe(3);
  });
});
