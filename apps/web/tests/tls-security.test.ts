import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

describe("TLS Security Constraints", () => {
  it("should not contain disabled TLS checks in tracked source files", () => {
    const projectRoot = path.resolve(__dirname, "../../..");

    // Get the list of all git-tracked files
    const trackedFiles = execSync("git ls-files", {
      cwd: projectRoot,
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .filter((f) => {
        // Exclude directories that should not be scanned
        if (f.startsWith("node_modules/")) return false;
        if (f.startsWith("build/")) return false;
        if (f.includes("test-results/")) return false;
        if (f.includes("playwright-report/")) return false;
        // Exclude this very test file (it constructs forbidden patterns dynamically)
        const basename = path.basename(f);
        if (basename === "tls-security.test.ts") return false;
        return true;
      });

    // Build forbidden patterns dynamically so this file never matches itself
    const forbiddenNodeTls = "NODE_TLS" + "_REJECT" + "_UNAUTHORIZED";
    // Regex to match rejectUnauthorized with any whitespace before false
    const forbiddenRejectRe = new RegExp(
      "reject" + "Unauthorized" + "\\s*:\\s*" + "false"
    );

    const violations: string[] = [];

    for (const relPath of trackedFiles) {
      const absPath = path.join(projectRoot, relPath);
      // Skip binary files or files that don't exist
      if (!fs.existsSync(absPath)) continue;
      let content: string;
      try {
        content = fs.readFileSync(absPath, "utf-8");
      } catch {
        continue; // skip unreadable files
      }

      if (content.includes(forbiddenNodeTls)) {
        violations.push(`${relPath}: contains ${forbiddenNodeTls}`);
      }
      if (forbiddenRejectRe.test(content)) {
        violations.push(`${relPath}: matches reject` + `Unauthorized pattern`);
      }
    }

    if (violations.length > 0) {
      console.error("TLS violations found:\n" + violations.join("\n"));
    }

    expect(violations).toEqual([]);
  });
});
