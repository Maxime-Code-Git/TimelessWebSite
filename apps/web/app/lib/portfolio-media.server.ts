import fs from "node:fs";
import fsPromises, { type FileHandle } from "node:fs/promises";
import path from "node:path";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const variantRegex = /^(480p|960p|1440p|1920p)$/;
const variantFileIdRegex = /^[0-9a-f]{32}-(480p|960p|1440p|1920p)$/;

export class PortfolioMediaNotFoundError extends Error {
  constructor() {
    super("Portfolio media not found");
    this.name = "PortfolioMediaNotFoundError";
  }
}

function isContained(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function assertRealDirectory(
  directoryPath: string,
  realBasePath: string
): Promise<string> {
  const lstat = await fsPromises.lstat(directoryPath);
  if (lstat.isSymbolicLink() || !lstat.isDirectory()) {
    throw new PortfolioMediaNotFoundError();
  }

  const realDirectoryPath = await fsPromises.realpath(directoryPath);
  if (!isContained(realBasePath, realDirectoryPath)) {
    throw new PortfolioMediaNotFoundError();
  }
  return realDirectoryPath;
}

export interface OpenPortfolioVariantResult {
  fileHandle: FileHandle;
  size: number;
}

export async function openPortfolioVariant(
  mediaBasePath: string,
  projectId: string,
  variant: string,
  variantFileId: string
): Promise<OpenPortfolioVariantResult> {
  if (
    !uuidRegex.test(projectId) ||
    !variantRegex.test(variant) ||
    !variantFileIdRegex.test(variantFileId) ||
    !variantFileId.endsWith(`-${variant}`)
  ) {
    throw new PortfolioMediaNotFoundError();
  }

  let fileHandle: FileHandle | null = null;
  try {
    const basePath = path.resolve(mediaBasePath);
    const baseLstat = await fsPromises.lstat(basePath);
    if (baseLstat.isSymbolicLink() || !baseLstat.isDirectory()) {
      throw new PortfolioMediaNotFoundError();
    }
    const realBasePath = await fsPromises.realpath(basePath);

    const projectPath = path.resolve(basePath, projectId);
    if (!isContained(basePath, projectPath)) throw new PortfolioMediaNotFoundError();
    await assertRealDirectory(projectPath, realBasePath);

    const variantPath = path.resolve(projectPath, variant);
    if (!isContained(projectPath, variantPath)) throw new PortfolioMediaNotFoundError();
    await assertRealDirectory(variantPath, realBasePath);

    const targetPath = path.resolve(variantPath, `${variantFileId}.webp`);
    if (!isContained(variantPath, targetPath)) throw new PortfolioMediaNotFoundError();

    const beforeOpen = await fsPromises.lstat(targetPath);
    if (beforeOpen.isSymbolicLink() || !beforeOpen.isFile()) {
      throw new PortfolioMediaNotFoundError();
    }

    const noFollow = typeof fs.constants.O_NOFOLLOW === "number"
      ? fs.constants.O_NOFOLLOW
      : 0;
    fileHandle = await fsPromises.open(targetPath, fs.constants.O_RDONLY | noFollow);
    const openedStat = await fileHandle.stat();
    if (!openedStat.isFile()) throw new PortfolioMediaNotFoundError();

    const afterOpen = await fsPromises.lstat(targetPath);
    const realTargetPath = await fsPromises.realpath(targetPath);
    if (
      afterOpen.isSymbolicLink() ||
      !afterOpen.isFile() ||
      afterOpen.dev !== openedStat.dev ||
      afterOpen.ino !== openedStat.ino ||
      !isContained(realBasePath, realTargetPath)
    ) {
      throw new PortfolioMediaNotFoundError();
    }

    const result = { fileHandle, size: openedStat.size };
    fileHandle = null;
    return result;
  } catch {
    throw new PortfolioMediaNotFoundError();
  } finally {
    if (fileHandle) await fileHandle.close().catch(() => undefined);
  }
}
