import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { execSync } from "node:child_process";

describe("TLS Security Constraints", () => {
  it("should not contain disabled TLS checks in the codebase", () => {
    // Construct forbidden strings dynamically so this file doesn't flag itself
    const forbidden1 = "NODE_TLS" + "_REJECT_UNAUTHORIZED";
    const forbidden2 = "reject" + "Unauthorized:" + " false";

    const projectRoot = path.resolve(__dirname, "../../..");

    // Scan the entire repository excluding common ignored directories
    // We also exclude this test file explicitly in the grep command if necessary,
    // but constructing the strings dynamically should be enough.
    const excludes = [
      "--exclude-dir=node_modules",
      "--exclude-dir=build",
      "--exclude-dir=test-results",
      "--exclude-dir=playwright-report",
      "--exclude-dir=.git"
    ].join(" ");

    // We use `|| true` to prevent execSync from throwing an error if grep finds nothing (exit code 1)
    const cmd = `grep -rI ${excludes} "${forbidden1}\\|${forbidden2}" "${projectRoot}" || true`;

    const output = execSync(cmd, { encoding: "utf-8" }).trim();

    if (output) {
      console.error("Found forbidden strings:", output);
    }

    expect(output).toBe("");
  });
});
