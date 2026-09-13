import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router";
import FormulesFr from "../app/routes/fr.formules";


const { mockedContent } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const defContent = require("../app/content/default-site-content.json");
  const content = JSON.parse(JSON.stringify(defContent));
  content.pricing.duo[0].includedItems = [{ id: "1", text: { fr: "200 photos + film court", en: "200 photos + short film" } }];
  content.pricing.photo[0].includedItems = [{ id: "2", text: { fr: "200 photos livrées", en: "200 photos delivered" } }];
  return { mockedContent: content };
});

vi.mock("react-router", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router")>();
  return {
    ...mod,
    useRouteLoaderData: () => ({ siteContent: mockedContent })
  };
});

describe("Formules Component", () => {
  it("renders Photo & Film category by default (Duo)", () => {
    render(
      <MemoryRouter>
        <FormulesFr />
      </MemoryRouter>
    );

    // Vérifie que le tab "Photo & Film" est sélectionné
    const activeTab = screen.getByRole("button", { name: "Photo & Film" });
    expect(activeTab).toHaveClass(/active/);

    // "200 photos + film court" is a feature of the Duo package
    expect(screen.getByText("200 photos + film court")).toBeInTheDocument();
  });

  it("switches categories when clicking tabs", () => {
    render(
      <MemoryRouter>
        <FormulesFr />
      </MemoryRouter>
    );

    const photoTab = screen.getByRole("button", { name: "Photographie" });
    fireEvent.click(photoTab);

    // Vérifie le changement de catégorie
    expect(photoTab).toHaveClass(/active/);

    // "200 photos livrées" is in Photo packages
    expect(screen.getByText("200 photos livrées")).toBeInTheDocument();
  });

  it("toggles FAQ accordion", () => {
    render(
      <MemoryRouter>
        <FormulesFr />
      </MemoryRouter>
    );

    // Clic on second FAQ question (closed by default)
    const questionBtn = screen.getByRole("button", { name: /Quel acompte pour réserver la date/i });

    // Fermé au début
    expect(questionBtn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Un acompte de réservation est demandé à la signature/i)).not.toBeInTheDocument();

    // Clic pour ouvrir
    fireEvent.click(questionBtn);
    expect(questionBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Un acompte de réservation est demandé à la signature/i)).toBeInTheDocument();

    // Clic pour fermer
    fireEvent.click(questionBtn);
    expect(questionBtn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Un acompte de réservation est demandé à la signature/i)).not.toBeInTheDocument();
  });

  describe("FAQ Visibility", () => {
    let originalFaqs: any;

    beforeEach(() => {
      originalFaqs = JSON.parse(JSON.stringify(mockedContent.pricingPage.faqs));
    });

    afterEach(() => {
      mockedContent.pricingPage.faqs = originalFaqs;
    });

    it("hides FAQ section if all questions are disabled", () => {
      mockedContent.pricingPage.faqs = [
        { id: "1", enabled: false, question: { fr: "Q1", en: "Q1" }, answer: { fr: "A1", en: "A1" } }
      ];

      render(
        <MemoryRouter>
          <FormulesFr />
        </MemoryRouter>
      );
      
      expect(screen.queryByTestId("pricing-faq-section")).not.toBeInTheDocument();
    });

    it("hides only disabled questions and opens the first visible one by default", () => {
      mockedContent.pricingPage.faqs = [
        { id: "1", enabled: false, question: { fr: "Q1", en: "Q1" }, answer: { fr: "A1", en: "A1" } },
        { id: "2", enabled: true, question: { fr: "Q2", en: "Q2" }, answer: { fr: "A2", en: "A2" } },
        { id: "3", enabled: true, question: { fr: "Q3", en: "Q3" }, answer: { fr: "A3", en: "A3" } }
      ];

      render(
        <MemoryRouter>
          <FormulesFr />
        </MemoryRouter>
      );

      expect(screen.getByTestId("pricing-faq-section")).toBeInTheDocument();
      expect(screen.queryByText("Q1")).not.toBeInTheDocument();
      expect(screen.getByText("Q2")).toBeInTheDocument();
      expect(screen.getByText("Q3")).toBeInTheDocument();

      const btn2 = screen.getByRole("button", { name: /Q2/i });
      const btn3 = screen.getByRole("button", { name: /Q3/i });
      expect(btn2).toHaveAttribute("aria-expanded", "true");
      expect(btn3).toHaveAttribute("aria-expanded", "false");
    });
  });
});
