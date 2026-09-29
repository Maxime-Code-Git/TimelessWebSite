import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PortfolioPage } from "../app/routes/PortfolioPage";
import defaultContent from "../app/content/default-site-content.json";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { PublicPortfolio } from "../app/lib/portfolio-content.server";

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

  it("FR: renders consent overlay without cover (YouTube), only load btn loads iframe, no storage", async () => {
    const portfolio: PublicPortfolio = {
      categories: [],
      photos: [],
      video: {
        provider: "youtube",
        videoId: "12345"
      }
    };

    const router = createMemoryRouter([{ path: "/", element: <PortfolioPage lang="fr" portfolio={portfolio} /> }]);
    const { container } = render(<RouterProvider router={router} />);

    // Initially, no iframe
    expect(container.querySelector("iframe")).toBeNull();

    // Check consent text and load button are presen
    expect(screen.getByText(/En lisant cette vidéo, vous acceptez que YouTube dépose des cookies/)).toBeInTheDocument();
    const cookieLink = screen.getByRole("link", { name: "En savoir plus sur les cookies" });
    expect(cookieLink).toHaveAttribute("href", "/fr/cookies");

    // Check clicking background doesn't create iframe
    const poster = container.querySelector('div[class*="videoPoster"]');
    if (poster) {
      fireEvent.click(poster);
      expect(container.querySelector("iframe")).toBeNull();
    }

    const loadBtn = screen.getByRole("button", { name: "Charger la vidéo depuis YouTube" });

    // Click load
    fireEvent.click(loadBtn);

    // Now iframe should be presen
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe?.src).toContain("youtube-nocookie.com");
    expect(iframe?.src).toContain("autoplay=1");

    // Click unload
    const unloadBtn = screen.getByRole("button", { name: "Fermer et décharger la vidéo" });
    fireEvent.click(unloadBtn);

    // Iframe gone
    expect(container.querySelector("iframe")).toBeNull();

    // Ensure no storage was used
    expect(localStorageSetItemSpy).not.toHaveBeenCalled();
    expect(sessionStorageSetItemSpy).not.toHaveBeenCalled();
    expect(cookieSetterSpy).not.toHaveBeenCalled();
  });

  it("EN: renders consent overlay with cover (Vimeo), only load btn loads iframe, unloads on cancel", async () => {
    const portfolio: PublicPortfolio = {
      categories: [],
      photos: [],
      video: {
        provider: "vimeo",
        videoId: "67890",
        cover: { imageId: "cover1", width: 1920, height: 1080, variants: [] }
      }
    };

    const router = createMemoryRouter([{ path: "/", element: <PortfolioPage lang="en" portfolio={portfolio} /> }]);
    const { container } = render(<RouterProvider router={router} />);

    // Initially, no iframe
    expect(container.querySelector("iframe")).toBeNull();

    // Check consent text and load button are presen
    expect(screen.getByText(/By playing this video, you accept that Vimeo sets cookies/)).toBeInTheDocument();
    const cookieLink = screen.getByRole("link", { name: "Learn more about cookies" });
    expect(cookieLink).toHaveAttribute("href", "/en/cookies");

    // Check clicking cover doesn't create iframe
    const coverImage = container.querySelector('img[class*="videoCoverImage"]');
    if (coverImage) {
      fireEvent.click(coverImage);
      expect(container.querySelector("iframe")).toBeNull();
    }

    const loadBtn = screen.getByRole("button", { name: "Load video from Vimeo" });

    // Click load
    fireEvent.click(loadBtn);

    // Now iframe should be presen
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe?.src).toContain("player.vimeo.com");
    expect(iframe?.src).toContain("autoplay=1");
    expect(iframe?.src).toContain("dnt=1");

    // Click unload
    const unloadBtn = screen.getByRole("button", { name: "Close and unload the video" });
    fireEvent.click(unloadBtn);

    // Iframe gone
    expect(container.querySelector("iframe")).toBeNull();
  });
});
