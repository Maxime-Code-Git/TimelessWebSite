#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const EXPECTED_SCHEMA_VERSION = 11;

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
      } catch (unlinkErr) {
        console.warn("Failed to clean up incomplete backup file:", backupPath, unlinkErr.message);
      }
    }
    throw new Error(`Failed to create backup: ${err.message}`, { cause: err });
  }

  return backupPath;
}

export function rotateBackups(filePath, maxKeep = 5) {
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath);

  if (!fs.existsSync(dir)) return;

  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (err) {
    console.warn("Could not read backup directory for rotation:", err.message);
    return;
  }

  const backups = files
    .filter((f) => f.startsWith(baseName) && f.endsWith(".bak"))
    .sort()
    .reverse();

  if (backups.length > maxKeep) {
    for (let i = maxKeep; i < backups.length; i++) {
      const backupToUnlink = path.join(dir, backups[i]);
      try {
        fs.unlinkSync(backupToUnlink);
      } catch (unlinkErr) {
        console.warn("Failed to rotate old backup file:", backups[i], unlinkErr.message);
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
    } catch (fsyncDirErr) {
      console.warn("Best-effort directory fsync failed:", fsyncDirErr.message);
    }
  } catch (err) {
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (unlinkTempErr) {
        console.warn("Failed to clean up temporary file:", tempFilePath, unlinkTempErr.message);
      }
    }
    throw new Error(`Failed to write atomically to target: ${err.message}`, { cause: err });
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (closeErr) {
        console.warn("Failed to close temporary file descriptor:", closeErr.message);
      }
    }
    if (dirFd !== null) {
      try {
        fs.closeSync(dirFd);
      } catch (closeDirErr) {
        console.warn("Failed to close directory descriptor:", closeDirErr.message);
      }
    }
  }
}

export function validateLegalDocumentStructure(doc, context) {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new Error(`Invalid ${context}: must be a JSON object`);
  }
  if (
    typeof doc.publicTitle !== "object" ||
    doc.publicTitle === null ||
    Array.isArray(doc.publicTitle) ||
    typeof doc.publicTitle.fr !== "string" ||
    doc.publicTitle.fr.trim().length === 0 ||
    typeof doc.publicTitle.en !== "string" ||
    doc.publicTitle.en.trim().length === 0
  ) {
    throw new Error(`Invalid ${context}: publicTitle must contain non-empty fr and en strings`);
  }
  if (
    typeof doc.intro !== "object" ||
    doc.intro === null ||
    Array.isArray(doc.intro) ||
    typeof doc.intro.fr !== "string" ||
    doc.intro.fr.trim().length === 0 ||
    typeof doc.intro.en !== "string" ||
    doc.intro.en.trim().length === 0
  ) {
    throw new Error(`Invalid ${context}: intro must contain non-empty fr and en strings`);
  }
  if (!Array.isArray(doc.sections)) {
    throw new Error(`Invalid ${context}: sections must be an array`);
  }
  if (
    typeof doc.version !== "number" ||
    !Number.isInteger(doc.version) ||
    doc.version < 1
  ) {
    throw new Error(`Invalid ${context}: version must be a positive integer`);
  }
}

export function validateTargetData(data) {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Invalid target content: root must be a JSON object");
  }

  if (data.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(`Invalid target content: schemaVersion must be ${EXPECTED_SCHEMA_VERSION}`);
  }

  if (
    typeof data.revision !== "string" ||
    data.revision.trim().length === 0 ||
    !(/^[0-9a-f]{32}$/i.test(data.revision) || /^[a-zA-Z0-9_-]{8,64}$/.test(data.revision))
  ) {
    throw new Error("Invalid target content: revision must be a valid non-empty string identifier");
  }

  if (
    typeof data.updatedAt !== "string" ||
    data.updatedAt.trim().length === 0 ||
    Number.isNaN(Date.parse(data.updatedAt))
  ) {
    throw new Error("Invalid target content: updatedAt must be a valid ISO date string");
  }

  if (typeof data.legalPages !== "object" || data.legalPages === null || Array.isArray(data.legalPages)) {
    throw new Error("Invalid target content: legalPages must be an object");
  }

  const legalKeys = ["mentions", "privacy", "cgv", "cookies"];
  for (const key of legalKeys) {
    const page = data.legalPages[key];
    if (typeof page !== "object" || page === null || Array.isArray(page)) {
      throw new Error(`Invalid target content: legalPages.${key} must be an object`);
    }

    if (!("draft" in page)) {
      throw new Error(`Invalid target content: legalPages.${key} must contain a draft property`);
    }
    if (!("published" in page)) {
      throw new Error(`Invalid target content: legalPages.${key} must contain a published property`);
    }
    if (!("history" in page)) {
      throw new Error(`Invalid target content: legalPages.${key} must contain a history property`);
    }

    if (!Array.isArray(page.history)) {
      throw new Error(`Invalid target content: legalPages.${key}.history must be an array`);
    }
    for (let i = 0; i < page.history.length; i++) {
      validateLegalDocumentStructure(page.history[i], `legalPages.${key}.history[${i}]`);
    }

    if (page.published !== null) {
      validateLegalDocumentStructure(page.published, `legalPages.${key}.published`);
    }

    if (page.draft !== null) {
      validateLegalDocumentStructure(page.draft, `legalPages.${key}.draft`);
    }
  }
}

export function validateSourceDrafts(sourceDrafts) {
  if (typeof sourceDrafts !== "object" || sourceDrafts === null || Array.isArray(sourceDrafts)) {
    throw new Error("Invalid source drafts: must be an object containing all 4 legal drafts");
  }

  const legalKeys = ["mentions", "privacy", "cgv", "cookies"];
  for (const key of legalKeys) {
    const draft = sourceDrafts[key];
    if (typeof draft !== "object" || draft === null || Array.isArray(draft)) {
      throw new Error(`Missing or invalid source draft for legal page: ${key}`);
    }

    validateLegalDocumentStructure(draft, `source draft for ${key}`);

    if (
      typeof draft.seoTitle !== "object" ||
      draft.seoTitle === null ||
      Array.isArray(draft.seoTitle) ||
      typeof draft.seoTitle.fr !== "string" ||
      draft.seoTitle.fr.trim().length === 0 ||
      typeof draft.seoTitle.en !== "string" ||
      draft.seoTitle.en.trim().length === 0
    ) {
      throw new Error(`Invalid source draft for ${key}: seoTitle must contain non-empty fr and en strings`);
    }

    if (
      typeof draft.seoDescription !== "object" ||
      draft.seoDescription === null ||
      Array.isArray(draft.seoDescription) ||
      typeof draft.seoDescription.fr !== "string" ||
      draft.seoDescription.fr.trim().length === 0 ||
      typeof draft.seoDescription.en !== "string" ||
      draft.seoDescription.en.trim().length === 0
    ) {
      throw new Error(`Invalid source draft for ${key}: seoDescription must contain non-empty fr and en strings`);
    }

    if (draft.sections.length === 0) {
      throw new Error(`Invalid source draft for ${key}: sections must not be empty`);
    }

    for (let sIdx = 0; sIdx < draft.sections.length; sIdx++) {
      const section = draft.sections[sIdx];
      if (typeof section !== "object" || section === null || Array.isArray(section)) {
        throw new Error(`Invalid section at index ${sIdx} in draft for ${key}`);
      }
      if (typeof section.id !== "string" || section.id.trim().length === 0) {
        throw new Error(`Invalid section id at index ${sIdx} in draft for ${key}`);
      }
      if (
        typeof section.title !== "object" ||
        section.title === null ||
        typeof section.title.fr !== "string" ||
        typeof section.title.en !== "string"
      ) {
        throw new Error(`Invalid section title at index ${sIdx} in draft for ${key}`);
      }
      if (!Array.isArray(section.paragraphs)) {
        throw new Error(`Invalid section paragraphs at index ${sIdx} in draft for ${key}`);
      }
    }

    if (key === "cookies") {
      if (!Array.isArray(draft.inventory) || draft.inventory.length === 0) {
        throw new Error("Invalid source draft for cookies: inventory must be a non-empty array");
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

  let targetData;
  try {
    const targetRaw = fs.readFileSync(resolvedTarget, "utf-8");
    targetData = JSON.parse(targetRaw);
  } catch (err) {
    throw new Error(`Failed to read or parse target content file: ${err.message}`, { cause: err });
  }

  // 1. Strict validation of target data BEFORE any backup or write
  validateTargetData(targetData);

  // 2. Resolve source drafts
  let sourceDrafts = drafts;
  if (!sourceDrafts) {
    let defaultData;
    try {
      const defaultRaw = fs.readFileSync(resolvedDefault, "utf-8");
      defaultData = JSON.parse(defaultRaw);
    } catch (err) {
      throw new Error(`Failed to read or parse default content file: ${err.message}`, { cause: err });
    }
    sourceDrafts = {
      mentions: defaultData?.legalPages?.mentions?.draft,
      privacy: defaultData?.legalPages?.privacy?.draft,
      cgv: defaultData?.legalPages?.cgv?.draft,
      cookies: defaultData?.legalPages?.cookies?.draft,
    };
  }

  // 3. Strict validation of source drafts BEFORE any backup or write
  validateSourceDrafts(sourceDrafts);

  const legalKeys = ["mentions", "privacy", "cgv", "cookies"];

  // 4. Idempotency check: see if drafts are already identical
  let allDraftsIdentical = true;
  for (const key of legalKeys) {
    const currentDraft = targetData.legalPages[key].draft;
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
    // DRY RUN MODE: do not modify target file, do not create backup, do not create temp file
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

  // 5. APPLY MODE: create backup and write atomically
  const backupFilePath = createBackup(resolvedTarget);

  const newRevision = crypto.randomBytes(16).toString("hex");
  const nowIso = new Date().toISOString();

  for (const key of legalKeys) {
    const existingPageState = targetData.legalPages[key];

    targetData.legalPages[key] = {
      ...existingPageState,
      // Replace ONLY the draft
      draft: {
        ...sourceDrafts[key],
        lastModified: nowIso,
      },
      // Strictly preserve published and history without conversion or replacement
      published: existingPageState.published,
      history: existingPageState.history,
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
