import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import AdminContactPage from "../app/routes/admin.contact";

describe("AdminContactPage CSS", () => {
  it("should explicitly check all styles references statically", () => {
    const contactPath = path.resolve(__dirname, "../app/routes/admin.contact.tsx");
    const cssPath = path.resolve(__dirname, "../app/routes/admin.module.css");
    
    const contactCode = fs.readFileSync(contactPath, "utf-8");
    const cssCode = fs.readFileSync(cssPath, "utf-8");
    
    // Find all styles.X usages
    const styleMatches = [...contactCode.matchAll(/styles\.([a-zA-Z0-9_]+)/g)];
    const usedClasses = new Set(styleMatches.map(m => m[1]));
    
    // Define explicitly the ones we know were missing before, renamed appropriately
    const explicitlyChecked = [
      "activeTabBtn", 
      "formContainer",
      "settingsGrid",
      "settingsSection",
      "successMessage" 
    ];
    
    // Make sure our file is actually using them
    for (const cls of explicitlyChecked) {
      expect(usedClasses.has(cls), `Expected admin.contact.tsx to use styles.${cls}`).toBe(true);
    }
    
    // Check if each used class is defined in admin.module.css
    const missing = [];
    for (const cls of usedClasses) {
      // Regex to find .className { or .className: or .className:global
      const classRegex = new RegExp(`\\.${cls}[\\s:{\\[]`);
      if (!classRegex.test(cssCode)) {
        missing.push(cls);
      }
    }
    
    expect(missing).toEqual([]);
  });

  it("should not contain any undefined CSS classes in DOM", async () => {
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
        loader: () => ({ contactPage: defaultData, revision: "123", csrfToken: "abc", storageWarning: false }),
        hydrateFallbackElement: <div>Loading...</div>
      }
    ]);
    const { container } = render(<RouterProvider router={router} />);
    const elementsWithUndefinedClass = container.querySelectorAll('[class*="undefined"]');
    expect(elementsWithUndefinedClass.length).toBe(0);
  });
});
