import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import AdminContactPage from "../app/routes/admin.contact";

describe("AdminContactPage Focus Management", () => {
  it("maintains focus on the input field while typing multiple characters", async () => {
    const defaultData = {
      seo: { title: { fr: "", en: "" }, description: { fr: "", en: "" } },
      hero: { title: { fr: "", en: "" }, subtitle: { fr: "", en: "" } },
      introBanner: { title: { fr: "", en: "" }, subtitle: { fr: "", en: "" }, badges: [
        { id: "duration", label: { fr: "", en: "" } },
        { id: "commitment", label: { fr: "", en: "" } },
        { id: "format", label: { fr: "", en: "" } }
      ] },
      bookingIntro: { overtitle: { fr: "", en: "" }, title: { fr: "", en: "" }, description: { fr: "", en: "" }, note: { fr: "", en: "" } },
      visioBooking: { title: { fr: "", en: "" }, unavailableMsg: { fr: "", en: "" }, selectDate: { fr: "", en: "" }, selectTime: { fr: "", en: "" }, timezone: { fr: "", en: "" }, formTitle: { fr: "", en: "" }, labelNames: { fr: "", en: "" }, labelEmail: { fr: "", en: "" }, labelPhone: { fr: "", en: "" }, labelWeddingDate: { fr: "", en: "" }, labelFormula: { fr: "", en: "" }, labelMessage: { fr: "", en: "" }, formulas: { photo: { fr: "", en: "" }, film: { fr: "", en: "" }, duo: { fr: "", en: "" }, custom: { fr: "", en: "" }, unknown: { fr: "", en: "" } }, btnSubmit: { fr: "", en: "" }, btnSubmitting: { fr: "", en: "" }, successTitle: { fr: "", en: "" }, successMsg: { fr: "", en: "" }, btnNewRequest: { fr: "", en: "" }, errTaken: { fr: "", en: "" }, errGeneric: { fr: "", en: "" }, loadingMsg: { fr: "", en: "" } },
      contactForm: { formPrompt: { fr: "", en: "" }, successMsg: { fr: "", en: "" }, btnSubmitting: { fr: "", en: "" }, labels: { names: { fr: "", en: "" }, email: { fr: "", en: "" }, phone: { fr: "", en: "" }, date: { fr: "", en: "" }, location: { fr: "", en: "" }, formula: { fr: "", en: "" }, message: { fr: "", en: "" }, submit: { fr: "", en: "" } }, placeholders: { names: { fr: "", en: "" }, email: { fr: "", en: "" }, phone: { fr: "", en: "" }, location: { fr: "", en: "" }, formulaDefault: { fr: "", en: "" }, message: { fr: "", en: "" } }, groupLabels: { photo: { fr: "", en: "" }, film: { fr: "", en: "" }, duo: { fr: "", en: "" } }, options: { custom: { fr: "", en: "" }, unknown: { fr: "", en: "" } }, errors: { invalidType: { fr: "", en: "" }, invalidRequest: { fr: "", en: "" }, payloadTooLarge: { fr: "", en: "" }, readError: { fr: "", en: "" }, invalidOrigin: { fr: "", en: "" }, requiredFields: { fr: "", en: "" }, maxLength: { fr: "", en: "" }, invalidEmail: { fr: "", en: "" }, invalidChars: { fr: "", en: "" }, invalidFormula: { fr: "", en: "" }, invalidDateFormat: { fr: "", en: "" }, invalidDate: { fr: "", en: "" }, invalidPhone: { fr: "", en: "" }, invalidNetwork: { fr: "", en: "" }, rateLimit: { fr: "", en: "" }, sendError: { fr: "", en: "" } } },
      contactDetails: { title: { fr: "", en: "" }, labelEmail: { fr: "", en: "" }, labelPhone: { fr: "", en: "" }, labelArea: { fr: "", en: "" }, labelSocial: { fr: "", en: "" }, labelInstagram: { fr: "", en: "" }, labelLinkedin: { fr: "", en: "" }, responseTime: { fr: "", en: "" } },
      bottomBanner: { text: { fr: "", en: "" }, linkLabel: { fr: "", en: "" } }
    };

    const router = createMemoryRouter([
      {
        path: "/",
        element: <AdminContactPage />,
        loader: () => ({ contactPage: defaultData, revision: "123", csrfToken: "abc", storageWarning: false })
      }
    ]);

    render(<RouterProvider router={router} />);

    // Get the SEO Title input field
    const input = await screen.findByLabelText("Titre SEO");
    expect(input).toBeInTheDocument();

    // Focus the input
    input.focus();
    expect(input).toHaveFocus();

    // Type a character by triggering change event
    fireEvent.change(input, { target: { value: "S" } });
    
    // Check if value updated and focus is retained
    expect(input).toHaveValue("S");
    expect(input).toHaveFocus();

    // Type another character
    fireEvent.change(input, { target: { value: "SE" } });
    
    expect(input).toHaveValue("SE");
    expect(input).toHaveFocus();
  });
});
