import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PortfolioPage } from "../app/routes/PortfolioPage";
import defaultContent from "../app/content/default-site-content.json";
import { createMemoryRouter, RouterProvider } from "react-router";

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

describe("PortfolioPage Video Lifecycle", () => {
  let localStorageSetItemSpy: ReturnType<typeof vi.spyOn>;
  let sessionStorageSetItemSpy: ReturnType<typeof vi.spyOn>;
  let cookieSetterSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorageSetItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    sessionStorageSetItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    cookieSetterSpy = vi.spyOn(document, 'cookie', 'set');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("FR: renders consent overlay without cover (YouTube), loads iframe on click, unloads on cancel, no storage", async () => {
    const portfolio = {
      id: "test",
      categories: [],
      photos: [],
      video: {
        provider: "youtube" as const,
        videoId: "12345",
        cover: null
      }
    };

    const router = createMemoryRouter([{ path: "/", element: <PortfolioPage lang="fr" portfolio={portfolio as any} /> }]);
    const { container } = render(<RouterProvider router={router} />);

    // Initially, no iframe
    let iframe = container.querySelector("iframe");
    expect(iframe).toBeNull();

    // Check consent text and load button are present
    expect(screen.getByText(/En lisant cette vidéo, vous acceptez que YouTube dépose des cookies/)).toBeInTheDocument();
    
    // Check exact cookie link
    const cookieLink = screen.getByRole("link", { name: "En savoir plus sur les cookies" });
    expect(cookieLink).toHaveAttribute("href", "/fr/cookies");

    const loadBtn = screen.getByRole("button", { name: "Charger la vidéo depuis YouTube" });
    expect(loadBtn).toBeInTheDocument();

    // Click load
    fireEvent.click(loadBtn);

    // Now iframe should be present
    iframe = container.querySelector("iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe?.src).toContain("youtube-nocookie.com");
    expect(iframe?.src).toContain("autoplay=1");

    // Unload button should appear
    const unloadBtn = screen.getByRole("button", { name: "Fermer et décharger la vidéo" });
    expect(unloadBtn).toBeInTheDocument();

    // Click unload
    fireEvent.click(unloadBtn);

    // Iframe gone, back to consent
    iframe = container.querySelector("iframe");
    expect(iframe).toBeNull();
    expect(screen.getByRole("button", { name: "Charger la vidéo depuis YouTube" })).toBeInTheDocument();

    // Ensure no storage was used
    expect(localStorageSetItemSpy).not.toHaveBeenCalled();
    expect(sessionStorageSetItemSpy).not.toHaveBeenCalled();
    expect(cookieSetterSpy).not.toHaveBeenCalled();
  });

  it("EN: renders consent overlay with cover (Vimeo), loads iframe on click, unloads on cancel", async () => {
    const portfolio = {
      id: "test",
      categories: [],
      photos: [],
      video: {
        provider: "vimeo" as const,
        videoId: "67890",
        cover: { imageId: "cover1", width: 1920, height: 1080, variants: [] }
      }
    };

    const router = createMemoryRouter([{ path: "/", element: <PortfolioPage lang="en" portfolio={portfolio as any} /> }]);
    const { container } = render(<RouterProvider router={router} />);

    // Initially, no iframe
    let iframe = container.querySelector("iframe");
    expect(iframe).toBeNull();

    // Check consent text and load button are present (same info screen as without cover)
    expect(screen.getByText(/By playing this video, you accept that Vimeo sets cookies/)).toBeInTheDocument();
    
    // Check exact cookie link
    const cookieLink = screen.getByRole("link", { name: "Learn more about cookies" });
    expect(cookieLink).toHaveAttribute("href", "/en/cookies");

    const loadBtn = screen.getByRole("button", { name: "Load video from Vimeo" });
    expect(loadBtn).toBeInTheDocument();

    // Click load
    fireEvent.click(loadBtn);

    // Now iframe should be present
    iframe = container.querySelector("iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe?.src).toContain("player.vimeo.com");
    expect(iframe?.src).toContain("autoplay=1");
    expect(iframe?.src).toContain("dnt=1");

    // Unload button should appear
    const unloadBtn = screen.getByRole("button", { name: "Close and unload the video" });
    expect(unloadBtn).toBeInTheDocument();

    // Click unload
    fireEvent.click(unloadBtn);

    // Iframe gone, back to consent
    iframe = container.querySelector("iframe");
    expect(iframe).toBeNull();
    expect(screen.getByRole("button", { name: "Load video from Vimeo" })).toBeInTheDocument();
  });
});
