#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveDefaultContentPath() {
  const candidates = [
    path.resolve(__dirname, "../app/content/default-site-content.json"),
    path.resolve(process.cwd(), "apps/web/app/content/default-site-content.json"),
    path.resolve(process.cwd(), "app/content/default-site-content.json"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Could not find default-site-content.json in expected locations.");
}

export function resolveActiveContentPath(customPath) {
  if (customPath) {
    return path.resolve(customPath);
  }

  if (process.env.SITE_CONTENT_PATH) {
    return path.resolve(process.env.SITE_CONTENT_PATH);
  }

  const candidates = [
    path.resolve(process.cwd(), "data/site-content.json"),
    path.resolve(process.cwd(), "apps/web/data/site-content.json"),
    path.resolve(__dirname, "../data/site-content.json"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback to standard data location relative to apps/web
  return path.resolve(__dirname, "../data/site-content.json");
}

export function createBackup(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(4).toString("hex");
  const backupPath = path.join(dir, `${baseName}.${timestamp}-${randomSuffix}.bak`);

  try {
    fs.copyFileSync(filePath, backupPath, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(backupPath, 0o600);
  } catch (err) {
    if (fs.existsSync(backupPath)) {
      try {
        fs.unlinkSync(backupPath);
      } catch {
        /* ignore */
      }
    }
    throw err;
  }

  return backupPath;
}

export function rotateBackups(filePath, maxKeep = 5) {
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath);

  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);
  const backups = files
    .filter((f) => f.startsWith(baseName) && f.endsWith(".bak"))
    .sort()
    .reverse();

  if (backups.length > maxKeep) {
    for (let i = maxKeep; i < backups.length; i++) {
      try {
        fs.unlinkSync(path.join(dir, backups[i]));
      } catch {
        /* ignore */
      }
    }
  }
}

export function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempFilePath = `${filePath}.tmp.${crypto.randomBytes(4).toString("hex")}`;
  let fd = null;
  let dirFd = null;

  try {
    const jsonStr = JSON.stringify(data, null, 2) + "\n";
    const buffer = Buffer.from(jsonStr, "utf-8");

    fd = fs.openSync(tempFilePath, "w", 0o600);

    let bytesWritten = 0;
    while (bytesWritten < buffer.length) {
      const written = fs.writeSync(
        fd,
        buffer,
        bytesWritten,
        buffer.length - bytesWritten,
        bytesWritten
      );
      if (written <= 0) {
        throw new Error("Wrote 0 bytes during atomic write");
      }
      bytesWritten += written;
    }

    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    fs.renameSync(tempFilePath, filePath);

    try {
      dirFd = fs.openSync(dir, "r");
      fs.fsyncSync(dirFd);
    } catch {
      // Best-effort directory fsync
    }
  } catch (err) {
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    if (dirFd !== null) {
      try {
        fs.closeSync(dirFd);
      } catch {
        /* ignore */
      }
    }
  }
}

function stripVolatiles(draft) {
  if (!draft || typeof draft !== "object") return draft;
  const rest = { ...draft };
  delete rest.lastModified;
  return rest;
}

export function areDraftsEqual(draftA, draftB) {
  return (
    JSON.stringify(stripVolatiles(draftA)) ===
    JSON.stringify(stripVolatiles(draftB))
  );
}

export function applyLegalDrafts({
  targetFilePath,
  defaultContentPath,
  drafts,
  apply = false,
} = {}) {
  const resolvedTarget = resolveActiveContentPath(targetFilePath);
  const resolvedDefault = defaultContentPath || resolveDefaultContentPath();

  if (!fs.existsSync(resolvedTarget)) {
    throw new Error(
      `Target active content file does not exist: ${resolvedTarget}`
    );
  }

  const targetRaw = fs.readFileSync(resolvedTarget, "utf-8");
  const targetData = JSON.parse(targetRaw);

  let sourceDrafts = drafts;
  if (!sourceDrafts) {
    const defaultRaw = fs.readFileSync(resolvedDefault, "utf-8");
    const defaultData = JSON.parse(defaultRaw);
    sourceDrafts = {
      mentions: defaultData.legalPages?.mentions?.draft,
      privacy: defaultData.legalPages?.privacy?.draft,
      cgv: defaultData.legalPages?.cgv?.draft,
      cookies: defaultData.legalPages?.cookies?.draft,
    };
  }

  const legalKeys = ["mentions", "privacy", "cgv", "cookies"];
  for (const key of legalKeys) {
    if (!sourceDrafts[key]) {
      throw new Error(`Missing source draft for legal page: ${key}`);
    }
  }

  if (!targetData.legalPages) {
    targetData.legalPages = {};
  }

  // Idempotency check: see if drafts are already identical
  let allDraftsIdentical = true;
  for (const key of legalKeys) {
    const currentDraft = targetData.legalPages[key]?.draft;
    if (!areDraftsEqual(currentDraft, sourceDrafts[key])) {
      allDraftsIdentical = false;
      break;
    }
  }

  if (allDraftsIdentical) {
    return {
      success: true,
      applied: false,
      dryRun: !apply,
      alreadyUpToDate: true,
      targetFilePath: resolvedTarget,
      backupFilePath: null,
      revision: targetData.revision,
      updatedAt: targetData.updatedAt,
    };
  }

  if (!apply) {
    // DRY RUN MODE: do not modify target file, do not create backup
    return {
      success: true,
      applied: false,
      dryRun: true,
      alreadyUpToDate: false,
      targetFilePath: resolvedTarget,
      backupFilePath: null,
      revision: targetData.revision,
      updatedAt: targetData.updatedAt,
      pagesToUpdate: legalKeys,
    };
  }

  // APPLY MODE: create backup and write atomically
  const backupFilePath = createBackup(resolvedTarget);

  const newRevision = crypto.randomBytes(16).toString("hex");
  const nowIso = new Date().toISOString();

  for (const key of legalKeys) {
    const existingPageState = targetData.legalPages[key] || {
      draft: null,
      published: null,
      history: [],
    };

    targetData.legalPages[key] = {
      ...existingPageState,
      // Replace ONLY the draft
      draft: {
        ...sourceDrafts[key],
        lastModified: nowIso,
      },
      // Strictly preserve published and history
      published: existingPageState.published ?? null,
      history: Array.isArray(existingPageState.history)
        ? existingPageState.history
        : [],
    };
  }

  // Update root metadata
  targetData.revision = newRevision;
  targetData.updatedAt = nowIso;

  atomicWriteJson(resolvedTarget, targetData);
  rotateBackups(resolvedTarget, 5);

  return {
    success: true,
    applied: true,
    dryRun: false,
    alreadyUpToDate: false,
    targetFilePath: resolvedTarget,
    backupFilePath,
    revision: newRevision,
    updatedAt: nowIso,
    updatedPages: legalKeys,
  };
}

// CLI Execution entrypoint
const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectExecution) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply") || args.includes("-a");

  let customTarget = null;
  const fileArgIndex = args.indexOf("--file");
  if (fileArgIndex !== -1 && args[fileArgIndex + 1]) {
    customTarget = args[fileArgIndex + 1];
  }

  try {
    const result = applyLegalDrafts({
      targetFilePath: customTarget,
      apply,
    });

    console.log("==========================================");
    console.log(" Sempra Legal Drafts Synchronization");
    console.log("==========================================");
    console.log(`Target file: ${result.targetFilePath}`);

    if (result.alreadyUpToDate) {
      console.log("Status: All 4 legal drafts are already strictly up to date.");
      console.log(`Current revision: ${result.revision}`);
      console.log("No modifications were written (idempotent).");
    } else if (result.dryRun) {
      console.log("Status: DRY RUN mode (no modifications made).");
      console.log("Drafts to update: mentions, privacy, cgv, cookies");
      console.log("To apply changes with automatic backup, run:");
      console.log("  npm run legal:apply-drafts -- --apply");
    } else if (result.applied) {
      console.log("Status: SUCCESS - 4 legal drafts applied.");
      console.log(`Backup created: ${result.backupFilePath}`);
      console.log(`New revision: ${result.revision}`);
      console.log(`Updated at: ${result.updatedAt}`);
      console.log("Published versions and history were strictly preserved.");
    }
    console.log("==========================================");
    process.exit(0);
  } catch (err) {
    console.error("ERROR applying legal drafts:", err.message);
    process.exit(1);
  }
}
