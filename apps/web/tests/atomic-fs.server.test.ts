import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { atomicWriteJson, atomicWrite, getBackups } from "../app/lib/atomic-fs.server";

describe("atomic-fs.server", () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atomic-fs-test-"));
    testFile = path.join(tempDir, "test.json");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes valid JSON successfully", () => {
    atomicWriteJson(testFile, { test: true });
    expect(JSON.parse(fs.readFileSync(testFile, "utf-8"))).toEqual({ test: true });
  });

  it("writes a Buffer successfully", () => {
    const content = Buffer.from("Buffer content", "utf-8");
    atomicWrite(testFile, content);
    expect(fs.readFileSync(testFile, "utf-8")).toBe("Buffer content");
  });

  it("resists multiple backups in the same millisecond without overwriting", () => {
    fs.writeFileSync(testFile, "v0");
    vi.spyOn(Date, "now").mockReturnValue(1234567890);
    atomicWrite(testFile, "v1");
    atomicWrite(testFile, "v2");

    const backups = getBackups(testFile);
    expect(backups.length).toBe(2);
    expect(backups[0]).not.toBe(backups[1]);
    const contents = backups.map(b => fs.readFileSync(path.join(tempDir, b), "utf-8")).sort();
    expect(contents).toEqual(["v0", "v1"]);
  });

  it("maintains exactly 5 backups maximum and keeps them unchanged when a new one is rotated", () => {
    fs.writeFileSync(testFile, "v0");
    for (let i = 1; i <= 7; i++) {
      vi.spyOn(Date, "now").mockReturnValue(1000000 + i * 1000);
      atomicWrite(testFile, `v${i}`);
    }
    const backups = getBackups(testFile);
    expect(backups.length).toBe(5);
    const contents = backups.map(b => fs.readFileSync(path.join(tempDir, b), "utf-8")).sort();
    // v0 and v1 were rotated out (v7 is the main file, so backups contain v2, v3, v4, v5, v6)
    expect(contents).toEqual(["v2", "v3", "v4", "v5", "v6"]);
  });

  it("handles writeSync returning 0 and throws without modifying original", () => {
    fs.writeFileSync(testFile, "original");
    const writeSpy = vi.spyOn(fs, "writeSync").mockImplementation((() => 0) as typeof fs.writeSync);
    expect(() => atomicWriteJson(testFile, { updated: true })).toThrow("Wrote 0 bytes");
    expect(fs.readFileSync(testFile, "utf-8")).toBe("original");
    expect(fs.readdirSync(tempDir).filter(f => f.includes(".tmp."))).toHaveLength(0);
    writeSpy.mockRestore();
  });

  it("handles partial writes correctly", () => {
    const originalWriteSync = fs.writeSync;
    let callCount = 0;
    const writeSpy = vi.spyOn(fs, "writeSync").mockImplementation(
      ((fd: number, buffer: NodeJS.ArrayBufferView, offset?: number | null, length?: number | null, position?: number | null): number => {
        callCount++;
        if (callCount === 1) {
          return originalWriteSync(fd, buffer, offset, 1, position);
        }
        return originalWriteSync(fd, buffer, offset, length, position);
      }) as typeof fs.writeSync
    );

    atomicWrite(testFile, "Test");
    expect(fs.readFileSync(testFile, "utf-8")).toBe("Test");
    expect(callCount).toBe(2);
    writeSpy.mockRestore();
  });

  it("leaves no temp files and deletes the new backup on rename failure, preserving the 5 old backups", () => {
    fs.writeFileSync(testFile, "v0");
    for (let i = 1; i <= 5; i++) {
      vi.spyOn(Date, "now").mockReturnValue(1000000 + i * 1000);
      atomicWrite(testFile, `v${i}`);
    }

    const beforeBackups = getBackups(testFile);
    expect(beforeBackups.length).toBe(5);

    vi.spyOn(Date, "now").mockReturnValue(2000000);
    const renameSpy = vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw new Error("Rename failed");
    });

    expect(() => atomicWrite(testFile, "v6")).toThrow("Rename failed");

    expect(fs.readFileSync(testFile, "utf-8")).toBe("v5"); // original kept
    expect(fs.readdirSync(tempDir).filter(f => f.includes(".tmp."))).toHaveLength(0); // no temp

    const afterBackups = getBackups(testFile);
    expect(afterBackups).toEqual(beforeBackups); // exactly 5 old backups unchanged

    renameSpy.mockRestore();
  });

  it("handles copyFileSync failure during backup", () => {
    fs.writeFileSync(testFile, "original");
    const copySpy = vi.spyOn(fs, "copyFileSync").mockImplementation(() => {
      throw new Error("Copy failed");
    });
    expect(() => atomicWrite(testFile, "new")).toThrow("Copy failed");
    expect(fs.readFileSync(testFile, "utf-8")).toBe("original");
    expect(fs.readdirSync(tempDir).filter(f => f.includes(".tmp."))).toHaveLength(0);
    copySpy.mockRestore();
  });

  it("handles chmodSync failure during backup", () => {
    fs.writeFileSync(testFile, "original");
    const chmodSpy = vi.spyOn(fs, "chmodSync").mockImplementation(() => {
      throw new Error("Chmod failed");
    });
    expect(() => atomicWrite(testFile, "new")).toThrow("Chmod failed");
    expect(fs.readFileSync(testFile, "utf-8")).toBe("original");
    expect(fs.readdirSync(tempDir).filter(f => f.includes(".tmp."))).toHaveLength(0);
    expect(fs.readdirSync(tempDir).filter(f => f.includes(".bak"))).toHaveLength(0);
    chmodSpy.mockRestore();
  });

  it("handles fsyncSync failure on temp file", () => {
    const fsyncSpy = vi.spyOn(fs, "fsyncSync").mockImplementation((fd: number) => {
      const stat = fs.fstatSync(fd);
      if (!stat.isDirectory()) {
        throw new Error("Fsync failed");
      }
    });
    expect(() => atomicWrite(testFile, "new")).toThrow("Fsync failed");
    expect(fs.readdirSync(tempDir).filter(f => f.includes(".tmp."))).toHaveLength(0);
    fsyncSpy.mockRestore();
  });

  it("handles directory fsync (best-effort) without throwing", () => {
    let dirFsyncCalled = false;
    const originalFsyncSync = fs.fsyncSync;
    const fsyncSpy = vi.spyOn(fs, "fsyncSync").mockImplementation((fd: number) => {
      const stat = fs.fstatSync(fd);
      if (stat.isDirectory()) {
        dirFsyncCalled = true;
        throw new Error("Dir Fsync failed");
      }
      return originalFsyncSync(fd);
    });

    // Verify it doesn't throw
    atomicWrite(testFile, "new-content");

    expect(dirFsyncCalled).toBe(true);
    expect(fs.readFileSync(testFile, "utf-8")).toBe("new-content");
    fsyncSpy.mockRestore();
  });

  it("handles rotation (best-effort) after rename without throwing", () => {
    fs.writeFileSync(testFile, "v0");
    for (let i = 1; i <= 6; i++) {
      vi.spyOn(Date, "now").mockReturnValue(1000000 + i * 1000);
      atomicWrite(testFile, `v${i}`);
    }
    const unlinkSpy = vi.spyOn(fs, "unlinkSync").mockImplementation((p: fs.PathLike) => {
      if (String(p).includes(".bak")) {
        throw new Error("Unlink failed");
      }
      fs.rmSync(p);
    });

    atomicWrite(testFile, "new-content"); // Should not throw despite unlink failing
    expect(fs.readFileSync(testFile, "utf-8")).toBe("new-content");
    unlinkSpy.mockRestore();
  });

  it("ensures file mode is 0600", () => {
    atomicWriteJson(testFile, { test: true });
    const stat = fs.statSync(testFile);
    if (os.platform() !== "win32") {
      expect((stat.mode & parseInt("777", 8)).toString(8)).toBe("600");
    }
  });

});
