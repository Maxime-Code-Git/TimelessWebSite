import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { execSync } from "node:child_process";

describe("TLS Security Constraints", () => {
  it("should not contain disabled TLS checks in the codebase", () => {
    const forbidden1 = "NODE_TLS_" + "REJECT_UNAUTHORIZED";
    const forbidden2 = "rejectUnauthorized:" + " false";
    
    // We only scan the `apps/web` directory for these forbidden strings.
    // We exclude tests directory because this file itself and other tests might contain it for asserting.
    const projectRoot = path.resolve(__dirname, "../");
    const cmd = `grep -rI --exclude-dir=tests --exclude-dir=node_modules "${forbidden1}\\|${forbidden2}" "${projectRoot}" || true`;
    
    const output = execSync(cmd).toString().trim();
    
    // If output is not empty, we found something forbidden!
    if (output) {
      console.error("Found forbidden strings:", output);
    }
    
    expect(output).toBe("");
  });
});
