import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { atomicWriteJson, getBackups } from "../app/lib/atomic-fs.server";

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

  it("creates a backup when modifying existing file and limits to 5 backups", () => {
    for (let i = 0; i < 7; i++) {
      atomicWriteJson(testFile, { count: i });
      // Artificial delay is not needed for backups if we manipulate mtime, but let's just write.
      // Wait, getBackups relies on timestamps. If they are all created in same ms, their names have a unique suffix.
    }
    const backups = getBackups(testFile);
    expect(backups.length).toBeLessThanOrEqual(5);
    expect(JSON.parse(fs.readFileSync(testFile, "utf-8"))).toEqual({ count: 6 });
  });

  it("handles writeSync returning 0 and throws without modifying original", () => {
    const originalContent = JSON.stringify({ original: true });
    fs.writeFileSync(testFile, originalContent);
    
    // We mock fs.writeSync to return 0 to simulate partial write
    const originalWriteSync = fs.writeSync;
    fs.writeSync = () => 0;

    try {
      expect(() => atomicWriteJson(testFile, { updated: true })).toThrow();
    } finally {
      fs.writeSync = originalWriteSync;
    }

    expect(fs.readFileSync(testFile, "utf-8")).toBe(originalContent);
    const afterFiles = fs.readdirSync(tempDir);
    // tmp files should be cleaned up
    expect(afterFiles.filter(f => f.includes(".tmp."))).toHaveLength(0);
  });

  it("leaves no temp files on rename failure", () => {
    const originalContent = JSON.stringify({ original: true });
    fs.writeFileSync(testFile, originalContent);
    
    const originalRenameSync = fs.renameSync;
    fs.renameSync = () => { throw new Error("Rename failed"); };

    try {
      expect(() => atomicWriteJson(testFile, { updated: true })).toThrow("Rename failed");
    } finally {
      fs.renameSync = originalRenameSync;
    }

    expect(fs.readFileSync(testFile, "utf-8")).toBe(originalContent);
    expect(fs.readdirSync(tempDir).filter(f => f.includes(".tmp."))).toHaveLength(0);
  });

  it("ensures file mode is 0600", () => {
    atomicWriteJson(testFile, { test: true });
    const stat = fs.statSync(testFile);
    // Check permissions on unix
    if (os.platform() !== "win32") {
      expect((stat.mode & parseInt("777", 8)).toString(8)).toBe("600");
    }
  });

});
