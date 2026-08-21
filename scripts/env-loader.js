import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Common JS and ESM compatible way to find root
const isESM = typeof import.meta !== 'undefined' && import.meta.url;
const currentFile = isESM ? fileURLToPath(import.meta.url) : __filename;
const currentDir = dirname(currentFile);

export function getMonorepoRoot() {
  let rootDir = currentDir;
  while (rootDir !== "/" && rootDir !== ".") {
    const pkgPath = resolve(rootDir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.name === "timeless") {
          return rootDir;
        }
      } catch {
        // ignore JSON parse errors
      }
    }
    rootDir = dirname(rootDir);
  }
  return process.cwd(); // Fallback
}

export function loadEnvLocal() {
  const rootDir = getMonorepoRoot();
  const envPath = resolve(rootDir, ".env.local");
  
  try {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      let parsed = {};
      if (typeof parseEnv === "function") {
        parsed = parseEnv(content);
      } else {
        // Simple fallback
        content.split('\n').forEach(line => {
          const match = line.match(/^([^=]+)=(.*)$/);
          if (match) parsed[match[1].trim()] = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
        });
      }
      for (const [key, value] of Object.entries(parsed)) {
        if (!(key in process.env)) {
          // If a variable is already set (e.g. from Playwright webServer.env), keep it.
          // Otherwise, set it from .env.local
          process.env[key] = value;
        }
      }
    }
  } catch {
    // Silently ignore if file doesn't exist
  }
}

// Automatically load when imported
loadEnvLocal();
