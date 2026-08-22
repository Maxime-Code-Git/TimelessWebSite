import { describe, it, expect } from "vitest";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";

const execAsync = promisify(exec);

describe("admin:hash script", () => {
  const scriptPath = path.resolve(__dirname, "../scripts/admin-hash.js");

  it("should exist", () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it("should fail gracefully without command-line arguments", async () => {
    try {
      await execAsync(`node ${scriptPath} arg1`, { cwd: path.resolve(__dirname, "..") });
      expect.unreachable("Should have failed");
    } catch (e: any) {
      expect(e.code).not.toBe(0);
      expect(e.stderr).toContain("Les arguments en ligne de commande sont refusés par sécurité.");
    }
  });

  it("should fail without a TTY", async () => {
    try {
      // Running it inside child_process.exec means stdin/stdout are not TTY by default
      await execAsync(`node ${scriptPath}`, { cwd: path.resolve(__dirname, "..") });
      expect.unreachable("Should have failed");
    } catch (e: unknown) {
      expect((e as any).code).not.toBe(0);
      expect((e as any).stderr).toContain("Ce script nécessite un terminal interactif (TTY).");
    }
  });
});
