import { test, expect } from "@playwright/test";
import { restoreDefaultSiteContent } from "./test-helpers";

test.describe("FAQ Admin", () => {
  test.beforeEach(() => restoreDefaultSiteContent());
  test.afterEach(() => restoreDefaultSiteContent());

  test("can edit FAQ and toggle visibility", async ({ page }) => {
    await page.goto("/admin");
    await page.locator('input[name="password"]').fill("e2e_password");
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("Administration Sempra")).toBeVisible();

    await page.goto("/admin/pricing");

    await page.getByLabel("Titre FAQ (FR)").fill("Questions très fréquentes Modifiées");
    await page.getByLabel("Titre FAQ (EN)").fill("Very frequently asked questions");

    await page.getByLabel("Question FR").first().fill("Première question modifiée ?");
    await page.getByLabel("Question EN").first().fill("First question modified?");
    await page.getByLabel("Réponse FR").first().fill("Première réponse modifiée.");
    await page.getByLabel("Réponse EN").first().fill("First answer modified.");

    const secondFaqCheckbox = page.getByLabel("Afficher cette question").nth(1);
    await secondFaqCheckbox.uncheck();

    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(page.getByRole("status")).toContainText("Formules et questions fréquentes mises à jour avec succès");

    await page.goto("/fr/formules");
    const faqSectionFr = page.getByTestId("pricing-faq-section");
    await expect(faqSectionFr.getByText("Questions très fréquentes Modifiées")).toBeVisible();

    const firstBtnFr = faqSectionFr.getByRole("button", { name: "Première question modifiée ?" });
    await expect(firstBtnFr).toBeVisible();
    await expect(firstBtnFr).toHaveAttribute("aria-expanded", "true");
    await expect(faqSectionFr.getByText("Première réponse modifiée.")).toBeVisible();

    const faqButtonsFr = faqSectionFr.locator("button[aria-expanded]");
    await expect(faqButtonsFr).toHaveCount(3);

    const firstBtnIdFr = await firstBtnFr.getAttribute("aria-controls");
    expect(firstBtnIdFr).toBeTruthy();
    await expect(faqSectionFr.locator(`#${firstBtnIdFr}`)).toBeVisible();

    // Verify 2nd FAQ is absent
    await expect(faqSectionFr.getByRole("button", { name: /Quel acompte pour réserver la date/i })).toHaveCount(0);
    // Verify 3rd and 4th FAQ remain visible
    await expect(faqSectionFr.getByRole("button", { name: /Quels sont les délais de livraison/i })).toBeVisible();
    await expect(faqSectionFr.getByRole("button", { name: /Peut-on personnaliser une formule/i })).toBeVisible();

    await page.goto("/en/pricing");
    const faqSectionEn = page.getByTestId("pricing-faq-section");
    await expect(faqSectionEn.getByText("Very frequently asked questions")).toBeVisible();

    const firstBtnEn = faqSectionEn.getByRole("button", { name: "First question modified?" });
    await expect(firstBtnEn).toBeVisible();
    await expect(firstBtnEn).toHaveAttribute("aria-expanded", "true");
    await expect(faqSectionEn.getByText("First answer modified.")).toBeVisible();

    const faqButtonsEn = faqSectionEn.locator("button[aria-expanded]");
    await expect(faqButtonsEn).toHaveCount(3);

    const firstBtnIdEn = await firstBtnEn.getAttribute("aria-controls");
    expect(firstBtnIdEn).toBeTruthy();
    await expect(faqSectionEn.locator(`#${firstBtnIdEn}`)).toBeVisible();

    // Verify 2nd FAQ is absent
    await expect(faqSectionEn.getByRole("button", { name: /What deposit is required/i })).toHaveCount(0);
    // Verify 3rd and 4th FAQ remain visible
    await expect(faqSectionEn.getByRole("button", { name: /What are the delivery times/i })).toBeVisible();
    await expect(faqSectionEn.getByRole("button", { name: /Can a package be customised/i })).toBeVisible();
  });
});
