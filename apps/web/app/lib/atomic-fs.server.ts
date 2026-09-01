import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function createBackup(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;

  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const timestamp = Date.now();
  const backupPath = path.join(dir, `${baseName}.${timestamp}.bak`);

  try {
    fs.copyFileSync(filePath, backupPath);
    fs.chmodSync(backupPath, 0o600);
  } catch (err) {
    if (fs.existsSync(backupPath)) {
      try {
        fs.unlinkSync(backupPath);
      } catch { /* ignore */ }
    }
    throw err;
  }

  return backupPath;
}

export function rotateBackups(filePath: string): void {
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath);

  const files = fs.readdirSync(dir);
  const backups = files
    .filter(f => f.startsWith(baseName) && f.endsWith(".bak"))
    .sort()
    .reverse();

  if (backups.length > 5) {
    for (let i = 5; i < backups.length; i++) {
      try {
        fs.unlinkSync(path.join(dir, backups[i]));
      } catch { /* ignore */ }
    }
  }
}

export function atomicWrite(filePath: string, content: string | Buffer): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempFilePath = `${filePath}.tmp.${crypto.randomBytes(4).toString("hex")}`;
  let fd: number | null = null;
  let dirFd: number | null = null;

  try {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf-8");
    fd = fs.openSync(tempFilePath, "w", 0o600);

    let bytesWritten = 0;
    while (bytesWritten < buffer.length) {
      const written = fs.writeSync(fd, buffer, bytesWritten, buffer.length - bytesWritten, bytesWritten);
      if (written <= 0) {
        throw new Error("Wrote 0 bytes");
      }
      bytesWritten += written;
    }

    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    const createdBackupPath = createBackup(filePath);

    try {
      fs.renameSync(tempFilePath, filePath);
    } catch (renameErr) {
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch { /* ignore */ }
      }
      if (createdBackupPath && fs.existsSync(createdBackupPath)) {
        try { fs.unlinkSync(createdBackupPath); } catch { /* ignore */ }
      }
      throw renameErr;
    }

    try {
      dirFd = fs.openSync(dir, "r");
      fs.fsyncSync(dirFd);
    } catch {
      // Best-effort
    }

    try {
      rotateBackups(filePath);
    } catch {
      // Best-effort
    }
  } catch (err) {
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch { /* ignore */ }
    }
    throw err;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
    if (dirFd !== null) {
      try { fs.closeSync(dirFd); } catch { /* ignore */ }
    }
  }
}

export function atomicWriteJson(filePath: string, data: unknown): void {
  const jsonStr = JSON.stringify(data, null, 2);
  atomicWrite(filePath, jsonStr);
}
