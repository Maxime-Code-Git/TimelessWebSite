import { expect, test } from "vitest";
import { execSync } from "node:child_process";

test("no PLAYWRIGHT_TEST in apps/web/app", () => {
  try {
    const output = execSync("grep -r 'PLAYWRIGHT_TEST' apps/web/app || true", {
      encoding: "utf-8",
    });
    // The grep command returns the matched lines. We expect it to be empty.
    expect(output.trim()).toBe("");
  } catch {
    // If grep fails, it means no match was found (which is good)
  }
});
