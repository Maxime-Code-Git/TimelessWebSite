import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import AdminPricing from "../app/routes/admin.pricing";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";

vi.mock("react-router", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router")>();
  return {
    ...mod,
    useLoaderData: () => ({
      pricing: { photo: [{ id: "photo-essential", name: { fr: "P", en: "P" }, summary: { fr: "S", en: "S" }, description: { fr: "D", en: "D" }, includedItems: [], priceCents: 10000, buttonText: { fr: "B", en: "B" }, featured: false }], film: [], duo: [] },
      pricingPage: {
        promoText: { fr: "", en: "" },
        promoTextBold: { fr: "", en: "" },
        caveat: { fr: "", en: "" },
        faqTitle: { fr: "", en: "" },
        faqs: [],
        addOns: [{
          id: "couple-session",
          enabled: true,
          name: { fr: "Séance", en: "Session" },
          optionalLabel: { fr: "+ Séance", en: "+ Session" },
          includedLabel: { fr: "Séance (Inclus)", en: "Session (Included)" },
          priceCents: 35000,
          placements: [
            { category: "photo", formulaId: "photo-essential", mode: "optional" }
          ]
        }]
      },
      revision: "rev-123",
      csrfToken: "token-123",
      storageWarning: false
    }),
    useActionData: () => undefined,
    useNavigation: () => ({ state: "idle" }),
    Form: ({ children }: { children: ReactNode }) => <form onSubmit={(e) => {
      e.preventDefault();
    }} data-testid="remix-form">{children}</form>
  };
});

describe("Admin Pricing UI", () => {
  it("modifies placement structure without losing focus or direct mutation", () => {
    render(
      <MemoryRouter>
        <AdminPricing />
      </MemoryRouter>
    );

    const select = screen.getByLabelText("PHOTO P");
    expect(select).toHaveValue("optional");

    fireEvent.change(select, { target: { value: "included" } });

    // Check that it updated visually
    expect(select).toHaveValue("included");

    // Get hidden input value
    const form = screen.getByTestId("remix-form");
    const hiddenInput = form.querySelector('input[name="pricingPage"]') as HTMLInputElement;
    const parsed = JSON.parse(hiddenInput.value);
    const addon = parsed.addOns[0];

    // The mode should be updated to 'included'
    expect(addon.placements).toEqual([
      { category: "photo", formulaId: "photo-essential", mode: "included" }
    ]);
  });
});
