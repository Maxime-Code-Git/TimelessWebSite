import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  getSiteContent,
  getRawSiteContent,
  savePricing,
  saveSettings,
  RevisionConflictError,
  ValidationError,
  CorruptedContentError
} from "../app/lib/site-content.server";
import defaultContent from "../app/content/default-site-content.json";

describe("site-content.server.ts", () => {
  const tempDir = path.join(__dirname, "temp-data");
  const tempFile = path.join(tempDir, "site-content.json");

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    process.env.SITE_CONTENT_PATH = tempFile;
  });

  afterAll(() => {
    // Cleanup everything
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.SITE_CONTENT_PATH;
  });

  beforeEach(() => {
    // Clean up file before each test
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      fs.unlinkSync(path.join(tempDir, file));
    }
  });

  it("should return defaults when file does not exist", () => {
    const content = getSiteContent();
    expect(content.revision).toBe(defaultContent.revision);
  });

  it("should return defaults and mark as corrupted when file contains invalid JSON", () => {
    fs.writeFileSync(tempFile, "{ invalid json }");
    const { content, isCorrupted } = getRawSiteContent();
    expect(isCorrupted).toBe(true);
    expect(content.revision).toBe(defaultContent.revision);

    const safeContent = getSiteContent();
    expect(safeContent.revision).toBe(defaultContent.revision);
  });

  it("should save pricing and update revision atomically", () => {
    // First, save the default content to have a valid baseline
    fs.writeFileSync(tempFile, JSON.stringify(defaultContent));

    const newPricing = JSON.parse(JSON.stringify(defaultContent.pricing));
    newPricing.photo[0].priceCents = 150000;

    const newRev = savePricing(newPricing, defaultContent.revision);
    expect(newRev).not.toBe(defaultContent.revision);

    const loaded = getSiteContent();
    expect(loaded.pricing.photo[0].priceCents).toBe(150000);
    expect(loaded.revision).toBe(newRev);
  });

  it("should save settings and update revision atomically", () => {
    fs.writeFileSync(tempFile, JSON.stringify(defaultContent));

    const newSettings = JSON.parse(JSON.stringify(defaultContent.business));
    newSettings.email = "test@example.com";

    const newRev = saveSettings(newSettings, defaultContent.revision);
    expect(newRev).not.toBe(defaultContent.revision);

    const loaded = getSiteContent();
    expect(loaded.business.email).toBe("test@example.com");
    expect(loaded.revision).toBe(newRev);
  });

  it("should fail with RevisionConflictError if previous revision does not match", () => {
    fs.writeFileSync(tempFile, JSON.stringify(defaultContent));

    const newSettings = JSON.parse(JSON.stringify(defaultContent.business));
    newSettings.email = "test@example.com";

    expect(() => saveSettings(newSettings, "wrong-revision")).toThrow(RevisionConflictError);
  });

  it("should reject corrupted/invalid data for settings", () => {
    fs.writeFileSync(tempFile, JSON.stringify(defaultContent));

    const newSettings = JSON.parse(JSON.stringify(defaultContent.business));
    newSettings.email = "not-an-email"; // invalid email

    expect(() => saveSettings(newSettings, defaultContent.revision)).toThrow(ValidationError);
    expect(() => saveSettings(newSettings, defaultContent.revision)).toThrow(/email/i);
  });

  it("should strip HTML and reject it", () => {
    fs.writeFileSync(tempFile, JSON.stringify(defaultContent));
    const newSettings = JSON.parse(JSON.stringify(defaultContent.business));
    newSettings.address = "<b>123 Street</b>";
    expect(() => saveSettings(newSettings, defaultContent.revision)).toThrow(ValidationError);
    expect(() => saveSettings(newSettings, defaultContent.revision)).toThrow(/HTML/);
  });

  it("should convert empty strings to null for optional fields", () => {
    fs.writeFileSync(tempFile, JSON.stringify(defaultContent));
    const newSettings = JSON.parse(JSON.stringify(defaultContent.business));
    newSettings.address = "   "; // whitespace only

    saveSettings(newSettings, defaultContent.revision);
    const loaded = getSiteContent();
    expect(loaded.business.address).toBeNull();
  });

  it("should validate phoneE164 strictly", () => {
    fs.writeFileSync(tempFile, JSON.stringify(defaultContent));
    const newSettings = JSON.parse(JSON.stringify(defaultContent.business));

    newSettings.phoneE164 = "0477863742"; // missing +
    expect(() => saveSettings(newSettings, defaultContent.revision)).toThrow(ValidationError);

    newSettings.phoneE164 = "+32477863742"; // valid
    expect(() => saveSettings(newSettings, defaultContent.revision)).not.toThrow();
  });

  it("should rotate backups and keep only 5", () => {
    fs.writeFileSync(tempFile, JSON.stringify(defaultContent));

    let currentRev = defaultContent.revision;
    const newSettings = JSON.parse(JSON.stringify(defaultContent.business));

    for (let i = 0; i < 7; i++) {
      newSettings.address = `Address ${i}`;
      currentRev = saveSettings(newSettings, currentRev);
      // add an artificial delay to ensure different timestamps if fs is fast
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }

    const files = fs.readdirSync(tempDir);
    const backups = files.filter(f => f.endsWith(".bak"));

    expect(backups.length).toBe(5);
  });

  it("should reject too many featured formulas", () => {
    fs.writeFileSync(tempFile, JSON.stringify(defaultContent));
    const newPricing = JSON.parse(JSON.stringify(defaultContent.pricing));
    newPricing.photo[0].featured = true;
    newPricing.photo[1].featured = true; // 2 featured

    expect(() => savePricing(newPricing, defaultContent.revision)).toThrow(ValidationError);
  });

  describe("Corruption and atomicSave Edge Cases", () => {
    it("should throw CorruptedContentError and keep file strictly identical if json is corrupted (savePricing)", () => {
      const corruptedData = Buffer.from("{ bad json ]");
      fs.writeFileSync(tempFile, corruptedData);

      const beforeStat = fs.statSync(tempFile);
      const beforeBackups = fs.readdirSync(tempDir).filter(f => f.endsWith(".bak")).length;

      const newPricing = JSON.parse(JSON.stringify(defaultContent.pricing));
      expect(() => savePricing(newPricing, defaultContent.revision)).toThrow(CorruptedContentError);

      const afterData = fs.readFileSync(tempFile);
      expect(afterData).toEqual(corruptedData);
      expect(fs.statSync(tempFile).mtimeMs).toBe(beforeStat.mtimeMs);

      // Verify no temp file and no new backup left
      const files = fs.readdirSync(tempDir);
      expect(files.filter(f => f.includes(".tmp."))).toHaveLength(0);
      expect(files.filter(f => f.endsWith(".bak"))).toHaveLength(beforeBackups);
    });

    it("should throw CorruptedContentError and keep file strictly identical if json is corrupted (saveSettings)", () => {
      const corruptedData = Buffer.from("{ bad json settings ]");
      fs.writeFileSync(tempFile, corruptedData);

      const beforeStat = fs.statSync(tempFile);
      const beforeBackups = fs.readdirSync(tempDir).filter(f => f.endsWith(".bak")).length;

      const newSettings = JSON.parse(JSON.stringify(defaultContent.business));
      expect(() => saveSettings(newSettings, defaultContent.revision)).toThrow(CorruptedContentError);

      const afterData = fs.readFileSync(tempFile);
      expect(afterData).toEqual(corruptedData);
      expect(fs.statSync(tempFile).mtimeMs).toBe(beforeStat.mtimeMs);

      // Verify no temp file and no new backup left
      const files = fs.readdirSync(tempDir);
      expect(files.filter(f => f.includes(".tmp."))).toHaveLength(0);
      expect(files.filter(f => f.endsWith(".bak"))).toHaveLength(beforeBackups);
    });

    it("should loop on partial positive writes and succeed", () => {
      fs.writeFileSync(tempFile, JSON.stringify(defaultContent));
      const newPricing = JSON.parse(JSON.stringify(defaultContent.pricing));
      newPricing.photo[0].priceCents = 99999;

      const originalWriteSync = fs.writeSync;
      let callCount = 0;

      // @ts-expect-error: TS struggles with overloaded fs.writeSync
      const writeSpy = vi.spyOn(fs, "writeSync").mockImplementation((fd: number, buffer: Uint8Array, offset: number, length: number, position: number) => {
        callCount++;
        // Force writing only 10 bytes at a time
        const chunk = Math.min(10, length);
        return originalWriteSync(fd, buffer, offset, chunk, position);
      });

      const newRev = savePricing(newPricing, defaultContent.revision);
      expect(newRev).not.toBe(defaultContent.revision);
      expect(callCount).toBeGreaterThan(1);

      writeSpy.mockRestore();

      const loaded = getSiteContent();
      expect(loaded.pricing.photo[0].priceCents).toBe(99999);
      expect(fs.statSync(tempFile).mode & 0o777).toBe(process.platform === "win32" ? fs.statSync(tempFile).mode & 0o777 : 0o600);
    });

    it("should throw and abort on 0 bytes written", () => {
      fs.writeFileSync(tempFile, JSON.stringify(defaultContent));
      const beforeData = fs.readFileSync(tempFile);
      const beforeBackups = fs.readdirSync(tempDir).filter(f => f.endsWith(".bak")).length;
      const newPricing = JSON.parse(JSON.stringify(defaultContent.pricing));

      const writeSpy = vi.spyOn(fs, "writeSync").mockImplementation(() => 0);

      expect(() => savePricing(newPricing, defaultContent.revision)).toThrow("Wrote 0 bytes");

      writeSpy.mockRestore();

      expect(fs.readFileSync(tempFile)).toEqual(beforeData);
      const files = fs.readdirSync(tempDir);
      expect(files.filter(f => f.includes(".tmp."))).toHaveLength(0);
      expect(files.filter(f => f.endsWith(".bak"))).toHaveLength(beforeBackups);
    });

    it("should throw and abort if fsyncSync on temp file fails before rename", () => {
      fs.writeFileSync(tempFile, JSON.stringify(defaultContent));
      const beforeData = fs.readFileSync(tempFile);
      const beforeBackups = fs.readdirSync(tempDir).filter(f => f.endsWith(".bak")).length;
      const newPricing = JSON.parse(JSON.stringify(defaultContent.pricing));

      let fsyncCalls = 0;
      const fsyncSpy = vi.spyOn(fs, "fsyncSync").mockImplementation(() => {
        fsyncCalls++;
        if (fsyncCalls === 1) { // First call is the temp file
          throw new Error("Fake fsync error");
        }
      });

      expect(() => savePricing(newPricing, defaultContent.revision)).toThrow("Fake fsync error");

      fsyncSpy.mockRestore();

      expect(fs.readFileSync(tempFile)).toEqual(beforeData);
      const files = fs.readdirSync(tempDir);
      expect(files.filter(f => f.includes(".tmp."))).toHaveLength(0);
      expect(files.filter(f => f.endsWith(".bak"))).toHaveLength(beforeBackups);
    });

    it("should ignore error if fsyncSync on directory fails after rename", () => {
      fs.writeFileSync(tempFile, JSON.stringify(defaultContent));
      const newPricing = JSON.parse(JSON.stringify(defaultContent.pricing));
      newPricing.photo[0].priceCents = 77777;

      let fsyncCalls = 0;
      const fsyncSpy = vi.spyOn(fs, "fsyncSync").mockImplementation((_fd) => {
        fsyncCalls++;
        if (fsyncCalls === 2) { // Second call is the directory
          throw new Error("Fake dir fsync error");
        }
      });

      // Should NOT throw
      const newRev = savePricing(newPricing, defaultContent.revision);
      expect(newRev).not.toBe(defaultContent.revision);

      fsyncSpy.mockRestore();

      const loaded = getSiteContent();
      expect(loaded.pricing.photo[0].priceCents).toBe(77777);
      expect(fs.statSync(tempFile).mode & 0o777).toBe(process.platform === "win32" ? fs.statSync(tempFile).mode & 0o777 : 0o600);
    });

    it("should throw and abort if renameSync fails", () => {
      fs.writeFileSync(tempFile, JSON.stringify(defaultContent));
      const beforeData = fs.readFileSync(tempFile);
      const beforeBackups = fs.readdirSync(tempDir).filter(f => f.endsWith(".bak")).length;
      const newPricing = JSON.parse(JSON.stringify(defaultContent.pricing));

      const renameSpy = vi.spyOn(fs, "renameSync").mockImplementation(() => {
        throw new Error("Fake rename error");
      });

      expect(() => savePricing(newPricing, defaultContent.revision)).toThrow("Fake rename error");

      renameSpy.mockRestore();

      expect(fs.readFileSync(tempFile)).toEqual(beforeData);
      const files = fs.readdirSync(tempDir);
      expect(files.filter(f => f.includes(".tmp."))).toHaveLength(0);
      expect(files.filter(f => f.endsWith(".bak"))).toHaveLength(beforeBackups);
    });

    it("copyFileSync succeeds then chmodSync of backup fails: original unchanged, no temp, no false backup", () => {
      fs.writeFileSync(tempFile, JSON.stringify(defaultContent));
      const beforeData = fs.readFileSync(tempFile);
      const beforeBackups = fs.readdirSync(tempDir).filter(f => f.endsWith(".bak")).length;
      const newPricing = JSON.parse(JSON.stringify(defaultContent.pricing));

      const chmodSpy = vi.spyOn(fs, "chmodSync").mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.endsWith(".bak")) {
          throw new Error("Fake chmod error");
        }
      });

      expect(() => savePricing(newPricing, defaultContent.revision)).toThrow("Fake chmod error");

      chmodSpy.mockRestore();

      // Original file unchanged
      expect(fs.readFileSync(tempFile)).toEqual(beforeData);
      // No temp files remain
      const files = fs.readdirSync(tempDir);
      expect(files.filter(f => f.includes(".tmp."))).toHaveLength(0);
      // No false backup created
      expect(files.filter(f => f.endsWith(".bak"))).toHaveLength(beforeBackups);
    });

    it("with five old backups, renameSync fails: all five old backups remain strictly identical", () => {
      fs.writeFileSync(tempFile, JSON.stringify(defaultContent));

      // Create 5 old backups manually
      const oldBackupPaths: string[] = [];
      const oldBackupContents: Buffer[] = [];
      for (let i = 0; i < 5; i++) {
        const bkp = path.join(tempDir, `site-content.json.${1000000 + i}.bak`);
        const content = Buffer.from(`backup-content-${i}`);
        fs.writeFileSync(bkp, content);
        oldBackupPaths.push(bkp);
        oldBackupContents.push(content);
      }

      const newPricing = JSON.parse(JSON.stringify(defaultContent.pricing));
      const renameSpy = vi.spyOn(fs, "renameSync").mockImplementation(() => {
        throw new Error("Fake rename error");
      });

      expect(() => savePricing(newPricing, defaultContent.revision)).toThrow("Fake rename error");

      renameSpy.mockRestore();

      // All 5 old backups remain strictly identical
      for (let i = 0; i < 5; i++) {
        expect(fs.existsSync(oldBackupPaths[i])).toBe(true);
        expect(fs.readFileSync(oldBackupPaths[i])).toEqual(oldBackupContents[i]);
      }
    });

    it("after a rename success: maximum 5 backups", () => {
      fs.writeFileSync(tempFile, JSON.stringify(defaultContent));
      let currentRev = defaultContent.revision;
      const newSettings = JSON.parse(JSON.stringify(defaultContent.business));

      for (let i = 0; i < 8; i++) {
        newSettings.address = `Addr ${i}`;
        currentRev = saveSettings(newSettings, currentRev);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }

      const files = fs.readdirSync(tempDir);
      const backups = files.filter(f => f.endsWith(".bak"));
      expect(backups.length).toBeLessThanOrEqual(5);
    });

    it("late rotation error does not announce failure after new JSON is installed", async () => {
      fs.writeFileSync(tempFile, JSON.stringify(defaultContent));
      const newPricing = JSON.parse(JSON.stringify(defaultContent.pricing));
      newPricing.photo[0].priceCents = 55555;

      // Import the module to mock the exported rotateBackups function
      const siteContentModule = await import("../app/lib/site-content.server");
      const rotateSpy = vi.spyOn(siteContentModule, "rotateBackups").mockImplementation(() => {
        throw new Error("Fake rotation error");
      });

      // This should NOT throw — rotation is best-effort
      const newRev = savePricing(newPricing, defaultContent.revision);
      expect(newRev).not.toBe(defaultContent.revision);

      rotateSpy.mockRestore();

      // Verify the new JSON is installed
      const loaded = getSiteContent();
      expect(loaded.pricing.photo[0].priceCents).toBe(55555);
    });
  });
});
