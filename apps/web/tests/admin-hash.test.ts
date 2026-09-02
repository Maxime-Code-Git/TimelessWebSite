import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { pathToFileURL } from "node:url";

describe("admin:hash script", () => {
  const scriptPath = path.resolve(__dirname, "../scripts/admin-hash.js");

  it("should exist", () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it("should fail gracefully with command-line arguments", async () => {
    const result = await runSpawn([scriptPath, "arg1"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Les arguments en ligne de commande sont refusés par sécurité.");
  });

  it("should fail without a TTY", async () => {
    const result = await runSpawn([scriptPath]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Ce script nécessite un terminal interactif (TTY).");
  });

  /**
   * Run the script with mocked TTY and prompt-driven input delivery.
   *
   * Uses spawn (no shell). Detects prompts by counting `*` markers
   * emitted by the readline masking. Sends exactly one input per new prompt.
   * Global 10s timeout ensures the test fails instead of hanging.
   */
  async function runScriptWithMockTty(inputs: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-hash-test-"));
    const mockTtyPath = path.join(tmpDir, "mock-tty.js");
    fs.writeFileSync(mockTtyPath, `
      process.stdout.isTTY = true;
      process.stdin.isTTY = true;
      import("${pathToFileURL(scriptPath).href}").catch(() => {});
    `);

    return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let promptCount = 0;
      let inputIndex = 0;
      let settled = false;

      const child = spawn(process.execPath, [mockTtyPath], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Global safety timeout — 10 seconds
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill();
          reject(new Error("admin-hash test timed out after 10s"));
        }
      }, 10_000);

      child.on("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });

      child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;

        // Count new `*` markers indicating a readline prompt is active
        const starCount = (text.match(/\*/g) || []).length;
        if (starCount > 0 && inputIndex < inputs.length) {
          // A new prompt has appeared — detect transition
          const newPromptCount = promptCount + starCount;
          // Send one input per prompt transition (prompt 1 = first password, prompt 2 = confirmation)
          if (newPromptCount > promptCount && inputIndex < inputs.length) {
            child.stdin?.write(inputs[inputIndex] + "\n");
            inputIndex++;
            if (inputIndex >= inputs.length) {
              // All inputs sent — close stdin orderly
              child.stdin?.end();
            }
          }
          promptCount = newPromptCount;
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("close", (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          // Detect premature closure before all prompts appeared
          if (inputIndex < inputs.length && code !== 0) {
            reject(new Error(`Process closed prematurely with code ${code} before all inputs were sent`));
            return;
          }
          resolve({ stdout, stderr, code });
        }
      });
    }).finally(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
    });
  }

  /**
   * Simple spawn helper for non-TTY tests (args validation, TTY check).
   */
  function runSpawn(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        cwd: path.resolve(__dirname, ".."),
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Spawn timed out"));
      }, 10_000);

      child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on("error", (err) => { clearTimeout(timer); reject(err); });
      child.on("close", (code) => {
        clearTimeout(timer);
        child.stdin?.end();
        resolve({ stdout, stderr, code });
      });
    });
  }

  it("should fail if password is too short", async () => {
    const result = await runScriptWithMockTty(["short"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("le mot de passe doit contenir au moins 12 caractères");
  }, 15_000);

  it("should fail if passwords do not match", async () => {
    const result = await runScriptWithMockTty(["longpassword123", "longpassword456"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("les mots de passe ne correspondent pas");
  }, 15_000);

  it("should succeed and generate hash if passwords match and are long enough", async () => {
    const result = await runScriptWithMockTty(["validpassword123", "validpassword123"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("ADMIN_PASSWORD_HASH généré avec succès");
    expect(result.stdout).toContain("$argon2id$");
  }, 15_000);
});
