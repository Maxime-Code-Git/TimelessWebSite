import { test, expect } from "@playwright/test";

test.describe("Admin CSP and Styles", () => {
  test("should not have any inline styles on /admin", async ({ page }) => {
    const cspViolations: string[] = [];
    page.on("pageerror", (err) => {
      cspViolations.push(err.message);
    });

    await page.goto("/admin");

    // Wait for the form to be visible to ensure the page has loaded
    await page.waitForSelector("form");

    // There should be NO inline styles on the form (no `style=` attributes)
    const elementsWithStyle = await page.$$("form [style], form[style]");
    expect(elementsWithStyle.length).toBe(0);

    // Verify there are no CSP violations reported
    const cspErrors = cspViolations.filter((msg) => msg.toLowerCase().includes("content security policy"));
    expect(cspErrors.length).toBe(0);
  });
});
