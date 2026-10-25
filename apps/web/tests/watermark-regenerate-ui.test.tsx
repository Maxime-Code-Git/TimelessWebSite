import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";
import AdminPortfolioWatermark from "../app/routes/admin.portfolio.watermark";

// Mock env-loader
vi.mock("../../../../scripts/env-loader.js", () => ({}));

let mockLoaderData = {
  watermarkText: "Mon Filigrane",
  portfolioRevision: "rev-init-111",
  watermarkRevision: "wm-init-aaa",
  csrfToken: "csrf-token-xyz",
  totalPhotos: 2,
  upToDatePhotos: 0,
  outdatedPhotos: 2,
};

let mockActionData: unknown = undefined;

type FetcherSubscriber = () => void;
const subscribers = new Set<FetcherSubscriber>();

const mockFetcher = {
  state: "idle" as "idle" | "submitting" | "loading",
  data: undefined as unknown,
  submit: vi.fn(),
  Form: ({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement>) => (
    <form {...props}>{children}</form>
  ),
};

const notifySubscribers = () => {
  subscribers.forEach((cb) => cb());
};

const setFetcherState = (state: "idle" | "submitting" | "loading", data?: unknown) => {
  mockFetcher.state = state;
  if (data !== undefined) {
    mockFetcher.data = data;
  }
  notifySubscribers();
};

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useLoaderData: () => mockLoaderData,
    useActionData: () => mockActionData,
    useNavigation: () => ({ state: "idle" }),
    useFetcher: () => {
      const [, setTick] = React.useState(0);
      React.useEffect(() => {
        const sub = () => setTick((t) => t + 1);
        subscribers.add(sub);
        return () => {
          subscribers.delete(sub);
        };
      }, []);
      return mockFetcher;
    },
    Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => (
      <a href={to} className={className}>{children}</a>
    ),
    Form: ({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement>) => (
      <form {...props}>{children}</form>
    ),
  };
});

describe("AdminPortfolioWatermark UI and State Machine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
    subscribers.clear();
    mockLoaderData = {
      watermarkText: "Mon Filigrane",
      portfolioRevision: "rev-init-111",
      watermarkRevision: "wm-init-aaa",
      csrfToken: "csrf-token-xyz",
      totalPhotos: 2,
      upToDatePhotos: 0,
      outdatedPhotos: 2,
    };
    mockActionData = undefined;
    mockFetcher.state = "idle";
    mockFetcher.data = undefined;
    mockFetcher.submit = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("1: absence totale d'attribut style dans le rendu de la page", () => {
    const { container } = render(<AdminPortfolioWatermark />);
    const styledElements = container.querySelectorAll("[style]");
    expect(styledElements.length).toBe(0);
  });

  it("2: utilisation du composant <progress> sans style inline pendant la régénération", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = render(<AdminPortfolioWatermark />);

    const button = screen.getByRole("button", {
      name: "Régénérer le filigrane des photos existantes",
    });

    act(() => {
      fireEvent.click(button);
    });

    const progress = container.querySelector("progress");
    expect(progress).not.toBeNull();
    expect(progress?.getAttribute("style")).toBeNull();
    expect(progress?.getAttribute("value")).toBe("0");
    expect(progress?.getAttribute("max")).toBe("2");

    // Accessible text indication
    expect(screen.getByText("Régénération en cours : 0 / 2 photos traitées...")).toBeInTheDocument();

    // Verify still zero inline styles across entire DOM
    const styledElements = container.querySelectorAll("[style]");
    expect(styledElements.length).toBe(0);
  });

  it("3: enchaînement de plusieurs réponses regenerate_one", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminPortfolioWatermark />);

    const button = screen.getByRole("button", {
      name: "Régénérer le filigrane des photos existantes",
    });

    act(() => {
      fireEvent.click(button);
    });

    // 1st submit called
    expect(mockFetcher.submit).toHaveBeenCalledTimes(1);
    expect(mockFetcher.submit).toHaveBeenLastCalledWith(
      {
        intent: "regenerate_one",
        csrfToken: "csrf-token-xyz",
        portfolioRevision: "rev-init-111",
      },
      { method: "POST" }
    );

    // Simulate response for Photo 1 (done === false)
    act(() => {
      setFetcherState("idle", {
        success: true,
        done: false,
        processedPhotoId: "photo-1",
        totalPhotos: 2,
        upToDatePhotos: 1,
        outdatedPhotos: 1,
        portfolioRevision: "rev-step-222",
      });
    });

    // 2nd submit called automatically
    expect(mockFetcher.submit).toHaveBeenCalledTimes(2);
    expect(mockFetcher.submit).toHaveBeenLastCalledWith(
      {
        intent: "regenerate_one",
        csrfToken: "csrf-token-xyz",
        portfolioRevision: "rev-step-222",
      },
      { method: "POST" }
    );
  });

  it("4: propagation de la nouvelle portfolioRevision", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = render(<AdminPortfolioWatermark />);

    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Régénérer le filigrane des photos existantes" })
      );
    });

    // Photo 1 returns revision "rev-step-222"
    act(() => {
      setFetcherState("idle", {
        success: true,
        done: false,
        portfolioRevision: "rev-step-222",
        totalPhotos: 2,
        upToDatePhotos: 1,
        outdatedPhotos: 1,
      });
    });

    // Check that hidden input has been updated with the new revision
    const hiddenRevInput = container.querySelector(
      'input[name="portfolioRevision"]'
    ) as HTMLInputElement;
    expect(hiddenRevInput.value).toBe("rev-step-222");

    // The next submit must use "rev-step-222"
    expect(mockFetcher.submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ portfolioRevision: "rev-step-222" }),
      { method: "POST" }
    );
  });

  it("5: passage final vers success lorsque done vaut true", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminPortfolioWatermark />);

    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Régénérer le filigrane des photos existantes" })
      );
    });

    // Simulate single photo done === true
    act(() => {
      setFetcherState("idle", {
        success: true,
        done: true,
        portfolioRevision: "rev-final-999",
        totalPhotos: 2,
        upToDatePhotos: 2,
        outdatedPhotos: 0,
      });
    });

    const successMsg = screen.getByRole("status");
    expect(successMsg).toBeInTheDocument();
    expect(successMsg).toHaveAttribute("id", "regeneration-success-message");
    expect(successMsg).toHaveTextContent("Les filigranes des photos existantes ont été régénérés.");

    // Button must be disabled
    const button = screen.getByRole("button", {
      name: "Régénérer le filigrane des photos existantes",
    });
    expect(button).toBeDisabled();
  });

  it("6: persistance du message après la mise à jour des compteurs et revalidation du loader", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { rerender } = render(<AdminPortfolioWatermark />);

    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Régénérer le filigrane des photos existantes" })
      );
    });

    act(() => {
      setFetcherState("idle", {
        success: true,
        done: true,
        portfolioRevision: "rev-final-999",
        totalPhotos: 2,
        upToDatePhotos: 2,
        outdatedPhotos: 0,
      });
    });

    expect(screen.getByRole("status")).toBeInTheDocument();

    // Simulate loader revalidation updating loaderData
    mockLoaderData = {
      ...mockLoaderData,
      portfolioRevision: "rev-final-999",
      upToDatePhotos: 2,
      outdatedPhotos: 0,
    };

    act(() => {
      rerender(<AdminPortfolioWatermark />);
    });

    // Success message must persist
    const successMsg = screen.getByRole("status");
    expect(successMsg).toBeInTheDocument();
    expect(successMsg).toHaveTextContent("Les filigranes des photos existantes ont été régénérés.");
  });

  it("7: arrêt propre en cas d'erreur avec message compréhensible et reprise possible", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminPortfolioWatermark />);

    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Régénérer le filigrane des photos existantes" })
      );
    });

    expect(mockFetcher.submit).toHaveBeenCalledTimes(1);

    // Simulate error response
    act(() => {
      setFetcherState("idle", {
        success: false,
        error: "Revision conflict",
      });
    });

    // Error alert is shown
    const errorMsg = screen.getByRole("alert");
    expect(errorMsg).toBeInTheDocument();
    expect(errorMsg).toHaveTextContent("Revision conflict");

    // Loop stopped: no additional submit call
    expect(mockFetcher.submit).toHaveBeenCalledTimes(1);

    // Button is enabled to allow retry
    const button = screen.getByRole("button", {
      name: "Régénérer le filigrane des photos existantes",
    });
    expect(button).not.toBeDisabled();

    // Clicking again resumes
    act(() => {
      fireEvent.click(button);
    });
    expect(mockFetcher.submit).toHaveBeenCalledTimes(2);
  });

  it("8: absence de double soumission sous React StrictMode ou re-rendu identique", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminPortfolioWatermark />);

    act(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Régénérer le filigrane des photos existantes" })
      );
    });

    expect(mockFetcher.submit).toHaveBeenCalledTimes(1);

    // Simulate response
    act(() => {
      setFetcherState("idle", {
        success: true,
        done: false,
        portfolioRevision: "rev-step-222",
        totalPhotos: 2,
        upToDatePhotos: 1,
        outdatedPhotos: 1,
      });
    });

    expect(mockFetcher.submit).toHaveBeenCalledTimes(2);

    // Simulate StrictMode or unexpected re-renders with the SAME fetcher state and data
    act(() => {
      notifySubscribers();
      notifySubscribers();
    });

    // Still exactly 2 submissions! No duplicate submission
    expect(mockFetcher.submit).toHaveBeenCalledTimes(2);
  });
});
