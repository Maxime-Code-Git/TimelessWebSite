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
    // Write original
    fs.writeFileSync(testFile, "v0");

    vi.spyOn(Date, "now").mockReturnValue(1234567890);
    
    atomicWrite(testFile, "v1");
    atomicWrite(testFile, "v2");
    
    vi.restoreAllMocks();

    const backups = getBackups(testFile);
    expect(backups.length).toBe(2);
    expect(backups[0]).not.toBe(backups[1]);
    
    // Sort chronologically (getBackups returns reverse sort, so backups[0] is newest (v1), backups[1] is oldest (v0))
    // Wait: actually v0 was backed up before writing v1. Then v1 was backed up before writing v2.
    // So the two backups contain v0 and v1.
    const contents = backups.map(b => fs.readFileSync(path.join(tempDir, b), "utf-8")).sort();
    expect(contents).toEqual(["v0", "v1"]);
  });

  it("handles writeSync returning 0 and throws without modifying original", () => {
    fs.writeFileSync(testFile, "original");
    
    const writeSpy = vi.spyOn(fs, "writeSync").mockImplementation(() => 0);
    
    expect(() => atomicWriteJson(testFile, { updated: true })).toThrow("Wrote 0 bytes");
    
    expect(fs.readFileSync(testFile, "utf-8")).toBe("original");
    const tmpFiles = fs.readdirSync(tempDir).filter(f => f.includes(".tmp."));
    expect(tmpFiles).toHaveLength(0);
    
    writeSpy.mockRestore();
  });

  it("handles partial writes correctly", () => {
    const originalWriteSync = fs.writeSync;
    let callCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writeSpy = vi.spyOn(fs, "writeSync").mockImplementation((...args: any[]) => {
      callCount++;
      if (callCount === 1) {
        // First call writes only 1 byte
        const fd = args[0];
        const buffer = args[1];
        const offset = args[2] || 0;
        const position = args[4];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (originalWriteSync as any)(fd, buffer, offset, 1, position);
      }
      // Subsequent calls write the rest
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalWriteSync as any)(...args);
    });

    atomicWrite(testFile, "Test");
    expect(fs.readFileSync(testFile, "utf-8")).toBe("Test");
    expect(callCount).toBe(2);
    
    writeSpy.mockRestore();
  });

  it("leaves no temp files on rename failure", () => {
    fs.writeFileSync(testFile, "original");
    
    const renameSpy = vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw new Error("Rename failed");
    });
    
    expect(() => atomicWriteJson(testFile, { updated: true })).toThrow("Rename failed");
    
    expect(fs.readFileSync(testFile, "utf-8")).toBe("original");
    expect(fs.readdirSync(tempDir).filter(f => f.includes(".tmp."))).toHaveLength(0);
    
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
    // backup should be cleaned up
    expect(fs.readdirSync(tempDir).filter(f => f.includes(".bak"))).toHaveLength(0);

    chmodSpy.mockRestore();
  });

  it("handles fsyncSync failure on temp file", () => {
    const fsyncSpy = vi.spyOn(fs, "fsyncSync").mockImplementation((fd) => {
      // Check if it's not a directory fd
      if (typeof fd === "number" && fd > 0) {
        throw new Error("Fsync failed");
      }
    });

    expect(() => atomicWrite(testFile, "new")).toThrow("Fsync failed");
    expect(fs.readdirSync(tempDir).filter(f => f.includes(".tmp."))).toHaveLength(0);

    fsyncSpy.mockRestore();
  });

  it("handles directory fsync (best-effort) without throwing", () => {
    let dirFsyncCalled = false;
    const fsyncSpy = vi.spyOn(fs, "fsyncSync").mockImplementation((fd) => {
      try {
        const stat = fs.fstatSync(fd);
        if (stat.isDirectory()) {
          dirFsyncCalled = true;
          throw new Error("Dir Fsync failed");
        }
      } catch {
        // ignored
      }
    });

    atomicWrite(testFile, "new");
    expect(dirFsyncCalled).toBe(true);
    expect(fs.readFileSync(testFile, "utf-8")).toBe("new");

    fsyncSpy.mockRestore();
  });

  it("handles rotation (best-effort) without throwing", () => {
    fs.writeFileSync(testFile, "original");
    // Ensure we trigger rotation
    for (let i=0; i<6; i++) {
      atomicWrite(testFile, `v${i}`);
    }
    const unlinkSpy = vi.spyOn(fs, "unlinkSync").mockImplementation((p) => {
      if (String(p).includes(".bak")) {
        throw new Error("Unlink failed");
      }
      fs.rmSync(p);
    });

    atomicWrite(testFile, "new"); // Should not throw despite unlink failing
    expect(fs.readFileSync(testFile, "utf-8")).toBe("new");

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
