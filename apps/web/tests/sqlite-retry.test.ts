// @vitest-environment node
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { executeWithSqliteRetry, isSqliteLockedOrBusyError } from "../e2e/sqlite-retry";

describe("SQLite Retry Helper (executeWithSqliteRetry & isSqliteLockedOrBusyError)", () => {
  it("should accurately identify SQLite locked and busy errors", () => {
    expect(isSqliteLockedOrBusyError({ errcode: 5 })).toBe(true);
    expect(isSqliteLockedOrBusyError({ errcode: 6 })).toBe(true);
    expect(isSqliteLockedOrBusyError(new Error("database is locked"))).toBe(true);
    expect(isSqliteLockedOrBusyError(new Error("database is busy"))).toBe(true);
    expect(isSqliteLockedOrBusyError({ message: "SQLite_BUSY error occurred" })).toBe(true);
    expect(isSqliteLockedOrBusyError({ errstr: "database table is locked" })).toBe(true);

    expect(isSqliteLockedOrBusyError(new Error("no such table: test"))).toBe(false);
    expect(isSqliteLockedOrBusyError(new Error("UNIQUE constraint failed"))).toBe(false);
    expect(isSqliteLockedOrBusyError(null)).toBe(false);
    expect(isSqliteLockedOrBusyError(undefined)).toBe(false);
    expect(isSqliteLockedOrBusyError("string error")).toBe(false);
  });

  it("should successfully execute operations on a clean database and return results", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-retry-test-"));
    const dbPath = path.join(tmpDir, "test.sqlite");

    try {
      const result = await executeWithSqliteRetry(dbPath, (db) => {
        db.exec("CREATE TABLE items (id TEXT, name TEXT);");
        db.prepare("INSERT INTO items VALUES (?, ?)").run("1", "item-1");
        const row = db.prepare("SELECT name FROM items WHERE id = ?").get("1") as { name: string };
        return row.name;
      });

      expect(result).toBe("item-1");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should retry on SQLITE_BUSY / database is locked and succeed when lock clears", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-retry-test-"));
    const dbPath = path.join(tmpDir, "test.sqlite");

    let attempts = 0;
    try {
      const result = await executeWithSqliteRetry(
        dbPath,
        (db) => {
          attempts++;
          if (attempts < 3) {
            const lockedErr = new Error("database is locked") as Error & { errcode: number };
            lockedErr.errcode = 5;
            throw lockedErr;
          }
          db.exec("CREATE TABLE IF NOT EXISTS test (val INT);");
          db.prepare("INSERT INTO test VALUES (?)").run(42);
          return 42;
        },
        { maxRetries: 4, initialDelayMs: 10, maxDelayMs: 20 }
      );

      expect(result).toBe(42);
      expect(attempts).toBe(3);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should not mask error and throw when retry limit is exhausted", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-retry-test-"));
    const dbPath = path.join(tmpDir, "test.sqlite");

    let attempts = 0;
    try {
      await expect(
        executeWithSqliteRetry(
          dbPath,
          () => {
            attempts++;
            const lockedErr = new Error("database is locked") as Error & { errcode: number };
            lockedErr.errcode = 5;
            throw lockedErr;
          },
          { maxRetries: 2, initialDelayMs: 5, maxDelayMs: 10 }
        )
      ).rejects.toThrow("database is locked");

      expect(attempts).toBe(3); // 1 initial + 2 retries
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should immediately rethrow non-busy errors without retrying", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-retry-test-"));
    const dbPath = path.join(tmpDir, "test.sqlite");

    let attempts = 0;
    try {
      await expect(
        executeWithSqliteRetry(
          dbPath,
          () => {
            attempts++;
            throw new Error("TABLE_NOT_FOUND: unrelated error");
          },
          { maxRetries: 5, initialDelayMs: 5 }
        )
      ).rejects.toThrow("TABLE_NOT_FOUND");

      expect(attempts).toBe(1); // No retries for non-busy errors
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
