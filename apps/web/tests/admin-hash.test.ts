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

  // Helper to run the script with mocked TTY and inputs
  async function runScriptWithMockTty(inputs: string[]): Promise<{ stdout: string, stderr: string, code: number | null }> {
    const mockTtyPath = path.join(__dirname, "mock-tty.js");
    fs.writeFileSync(mockTtyPath, `
      process.stdout.isTTY = true;
      process.stdin.isTTY = true;
      import("../scripts/admin-hash.js").catch(console.error);
    `);

    return new Promise((resolve) => {
      const child = exec("node mock-tty.js", { cwd: __dirname });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => stdout += data);
      child.stderr?.on("data", (data) => stderr += data);

      // Provide inputs with a small delay to avoid readline buffer issues
      let index = 0;
      function sendNext() {
        if (index < inputs.length) {
          child.stdin?.write(inputs[index] + "\n");
          index++;
          setTimeout(sendNext, 100);
        } else {
          child.stdin?.end();
        }
      }
      sendNext();

      child.on("close", (code) => {
        fs.unlinkSync(mockTtyPath);
        resolve({ stdout, stderr, code });
      });
    });
  }

  it("should fail if password is too short", async () => {
    const result = await runScriptWithMockTty(["short"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("le mot de passe doit contenir au moins 12 caractères");
  });

  it("should fail if passwords do not match", async () => {
    const result = await runScriptWithMockTty(["longpassword123", "longpassword456"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("les mots de passe ne correspondent pas");
  });

  it("should succeed and generate hash if passwords match and are long enough", async () => {
    const result = await runScriptWithMockTty(["validpassword123", "validpassword123"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("ADMIN_PASSWORD_HASH généré avec succès");
    expect(result.stdout).toContain("$argon2id$");
  });
});
