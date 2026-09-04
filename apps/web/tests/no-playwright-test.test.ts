import { expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";

test("no PLAYWRIGHT_TEST in apps/web/app", () => {
  const appDirectory = path.resolve(__dirname, "../app");
  const pendingDirectories = [appDirectory];
  const matchingFiles: string[] = [];

  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop()!;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pendingDirectories.push(entryPath);
      } else if (entry.isFile() && fs.readFileSync(entryPath, "utf8").includes("PLAYWRIGHT_TEST")) {
        matchingFiles.push(path.relative(appDirectory, entryPath));
      }
    }
  }

  expect(matchingFiles).toEqual([]);
});
