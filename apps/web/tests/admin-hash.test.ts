import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// @ts-expect-error: no types for this script
import { generateAdminHash } from "../scripts/admin-hash.js";
import readline from "node:readline";

vi.mock("node:readline", () => ({
  default: {
    createInterface: vi.fn(),
  },
}));

describe("generateAdminHash", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRl: any;
  let originalEnv: NodeJS.ProcessEnv;
  let originalArgv: string[];
  let originalStdin: NodeJS.ReadStream;
  let originalStdout: NodeJS.WriteStream;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalArgv = [...process.argv];
    originalStdin = process.stdin;
    originalStdout = process.stdout;

    process.env.NODE_ENV = "test";

    mockRl = {
      question: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockRl);

    // Mock TTY by default
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    process.env = originalEnv;
    process.argv = originalArgv;
    Object.defineProperty(process.stdin, "isTTY", { value: originalStdin.isTTY, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: originalStdout.isTTY, configurable: true });
    vi.restoreAllMocks();
  });

  it("should fail if arguments are provided", async () => {
    process.argv = ["node", "script.js", "arg1"];
    process.env.NODE_ENV = "production";
    await expect(generateAdminHash()).rejects.toThrow("Aucun argument n'est autorisé.");
  });

  it("should fail without TTY", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    process.env.NODE_ENV = "production";
    await expect(generateAdminHash()).rejects.toThrow("Cette commande doit être exécutée dans un terminal interactif");
  });

  it("should fail if password is too short", async () => {
    mockRl.question.mockImplementation((_: string, cb: (ans: string) => void) => {
      cb("short");
    });
    await expect(generateAdminHash()).rejects.toThrow("Le mot de passe doit contenir au moins 12 caractères.");
  });

  it("should fail if passwords do not match", async () => {
    let callCount = 0;
    mockRl.question.mockImplementation((_: string, cb: (ans: string) => void) => {
      callCount++;
      if (callCount === 1) cb("longenoughpassword");
      else cb("differentpassword");
    });
    await expect(generateAdminHash()).rejects.toThrow("Les mots de passe ne correspondent pas.");
  });

  it("should generate a hash for matching long passwords and not output password", async () => {
    mockRl.question.mockImplementation((_: string, cb: (ans: string) => void) => {
      cb("longenoughpassword");
    });

    const result = await generateAdminHash();
    expect(result).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);

    // Ensure password is not in logs
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining("longenoughpassword"));
  });
});
