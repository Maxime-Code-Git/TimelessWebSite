import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { PortfolioPage } from "../app/routes/PortfolioPage";

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual as Record<string, unknown>,
    useLocation: () => ({ search: "" })
  };
});

describe("PortfolioPage Video Fallback", () => {
  it("renders video section without cover and plays video in FR", async () => {
    const portfolio = {
      seo: { title: { fr: "", en: "" }, description: { fr: "", en: "" } },
      hero: { title: { fr: "", en: "" }, subtitle: { fr: "", en: "" }, paragraph: { fr: "", en: "" } },
      video: {
        provider: "youtube" as const,
        videoId: "12345",
        cover: undefined
      },
      categories: [],
      photos: []
    };

    const router = createMemoryRouter([
      {
        path: "/",
        element: <PortfolioPage lang="fr" portfolio={portfolio} />
      }
    ]);
    render(<RouterProvider router={router} />);

    // No cover picture should be present
    expect(document.querySelector("picture")).not.toBeInTheDocument();

    // The fallback play button
    const playBtn = screen.getByRole("button", { name: "Lire la vidéo" });
    expect(playBtn).toBeInTheDocument();
    
    // Click play
    fireEvent.click(playBtn);
    
    // Iframe appears
    expect(document.querySelector("iframe")).toBeInTheDocument();
  });

  it("renders video section without cover and plays video in EN", async () => {
    const portfolio = {
      seo: { title: { fr: "", en: "" }, description: { fr: "", en: "" } },
      hero: { title: { fr: "", en: "" }, subtitle: { fr: "", en: "" }, paragraph: { fr: "", en: "" } },
      video: {
        provider: "youtube" as const,
        videoId: "12345",
        cover: undefined
      },
      categories: [],
      photos: []
    };

    const router = createMemoryRouter([
      {
        path: "/",
        element: <PortfolioPage lang="en" portfolio={portfolio} />
      }
    ]);
    render(<RouterProvider router={router} />);
    
    const playBtn = screen.getByRole("button", { name: "Play video" });
    expect(playBtn).toBeInTheDocument();
  });
});
