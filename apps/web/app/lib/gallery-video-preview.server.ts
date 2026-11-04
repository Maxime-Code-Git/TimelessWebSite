import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ENV } from "./env.server";
import { getGalleryDb } from "./gallery-db.server";

export const PREVIEW_FILENAME = "video-v1.mp4";
export const MIN_DISK_FREE = 512 * 1024 * 1024; // 512 MB
export const MAX_PREVIEW_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
export const MAX_ENCODING_TIME = 2 * 60 * 60 * 1000; // 2 hours

let customMachineLockPath: string | null = null;

export function getMachineLockPath(): string {
  if (customMachineLockPath) return customMachineLockPath;
  if (process.env.GALLERY_VIDEO_PREVIEW_LOCK_PATH) {
    return process.env.GALLERY_VIDEO_PREVIEW_LOCK_PATH;
  }
  return "/tmp/gallery-video-preview.lock";
}

export function __setMachineLockPathForTest(customPath: string | null): void {
  customMachineLockPath = customPath;
}

export type GalleryVideoPreviewStatus =
  | { state: "missing" | "processing" | "ready" }
  | { state: "failed"; message: string };

export class PreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewError";
  }
}

let activeKey: string | undefined;
const failures = new Map<string, string>();

/**
 * Resolves the path to the ffmpeg executable, checking known Homebrew and system locations.
 */
export function getFfmpegPath(): string | null {
  if (process.env.FFMPEG_PATH === "none" || process.env.FFMPEG_PATH === "disabled") {
    return null;
  }
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  const candidates = [
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const stat = fs.statSync(c);
        if (stat.isFile()) return c;
      } catch {
        // ignore
      }
    }
  }

  // Check PATH if available
  const envPath = process.env.PATH || "";
  const parts = envPath.split(":");
  for (const p of parts) {
    if (!p) continue;
    const candidate = path.join(p, "ffmpeg");
    if (fs.existsSync(candidate)) {
      try {
        const stat = fs.statSync(candidate);
        if (stat.isFile()) return candidate;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

export function isGalleryVideoPreviewProcessing(galleryId: string, mediaId: string): boolean {
  if (activeKey === `${galleryId}:${mediaId}`) return true;

  // Check global machine lock
  try {
    const lockPath = getMachineLockPath();
    if (fs.existsSync(lockPath)) {
      const content = fs.readFileSync(lockPath, "utf8");
      const lockData = JSON.parse(content) as { pid: number; galleryId: string; mediaId: string; heartbeat: number };
      if (lockData.galleryId === galleryId && lockData.mediaId === mediaId) {
        try {
          // If PID is alive and heartbeat not stale (< 5 min)
          process.kill(lockData.pid, 0);
          if (Date.now() - lockData.heartbeat < 5 * 60 * 1000) {
            return true;
          }
        } catch {
          // Process dead -> not processing
        }
      }
    }
  } catch {
    // ignore
  }
  return false;
}

export function acquireGlobalLock(galleryId: string, mediaId: string): boolean {
  try {
    const lockPath = getMachineLockPath();
    if (fs.existsSync(lockPath)) {
      try {
        const content = fs.readFileSync(lockPath, "utf8");
        const lockData = JSON.parse(content) as { pid: number; heartbeat: number };
        let isAlive = false;
        try {
          process.kill(lockData.pid, 0);
          isAlive = true;
        } catch {
          isAlive = false;
        }

        // Stale if process is dead or heartbeat older than 5 minutes
        if (isAlive && (Date.now() - lockData.heartbeat < 5 * 60 * 1000)) {
          return false; // busy
        }

        // Clean up stale lock
        try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
      } catch {
        try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
      }
    }

    const lockDir = path.dirname(lockPath);
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true, mode: 0o700 });
    }

    const payload = JSON.stringify({
      pid: process.pid,
      galleryId,
      mediaId,
      heartbeat: Date.now(),
      startTime: Date.now(),
    });
    fs.writeFileSync(lockPath, payload, { flag: "wx", mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

function updateGlobalLockHeartbeat(): void {
  try {
    const lockPath = getMachineLockPath();
    if (fs.existsSync(lockPath)) {
      const content = fs.readFileSync(lockPath, "utf8");
      const data = JSON.parse(content);
      if (data.pid === process.pid) {
        data.heartbeat = Date.now();
        fs.writeFileSync(lockPath, JSON.stringify(data), { mode: 0o600 });
      }
    }
  } catch {
    // ignore
  }
}

export function releaseGlobalLock(galleryId: string, mediaId: string): void {
  try {
    const lockPath = getMachineLockPath();
    if (fs.existsSync(lockPath)) {
      const content = fs.readFileSync(lockPath, "utf8");
      const data = JSON.parse(content);
      if (data.pid === process.pid && data.galleryId === galleryId && data.mediaId === mediaId) {
        fs.unlinkSync(lockPath);
      }
    }
  } catch {
    // ignore
  }
}

export function enforceSafeConfinement(base: string, segments: string[]): string {
  const resolvedBase = path.resolve(base);
  if (fs.existsSync(resolvedBase) && fs.lstatSync(resolvedBase).isSymbolicLink()) {
    throw new PreviewError("Racine invalide (lien symbolique interdit).");
  }

  let current = resolvedBase;
  for (const seg of segments) {
    if (!seg || seg === "." || seg === ".." || seg.includes("/") || seg.includes("\\") || seg.includes("\0")) {
      throw new PreviewError("Segment de chemin invalide.");
    }
    current = path.join(current, seg);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new PreviewError("Lien symbolique détecté sur le chemin.");
    }
  }

  const rel = path.relative(resolvedBase, current);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new PreviewError("Confinement strict non respecté.");
  }
  return current;
}

export function getGalleryVideoPreviewPath(galleryId: string, mediaId: string): string {
  return enforceSafeConfinement(ENV.GALLERY_MEDIA_PATH, [galleryId, ".previews", mediaId, PREVIEW_FILENAME]);
}

export function hasGalleryVideoPreview(galleryId: string, mediaId: string): boolean {
  try {
    const previewPath = getGalleryVideoPreviewPath(galleryId, mediaId);
    if (!fs.existsSync(previewPath)) return false;
    const stat = fs.statSync(previewPath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

export function getGalleryVideoPreviewStatus(galleryId: string, mediaId: string): GalleryVideoPreviewStatus {
  const key = `${galleryId}:${mediaId}`;
  if (hasGalleryVideoPreview(galleryId, mediaId)) return { state: "ready" };
  if (isGalleryVideoPreviewProcessing(galleryId, mediaId)) return { state: "processing" };
  const message = failures.get(key);
  return message ? { state: "failed", message } : { state: "missing" };
}

function findVideo(galleryId: string, mediaId: string) {
  return getGalleryDb().prepare(`
    SELECT id, type, mime_type, visibility
    FROM gallery_media
    WHERE gallery_id = ? AND id = ? AND type = 'video'
  `).get(galleryId, mediaId) as { id: string; type: string; mime_type: string; visibility: string } | undefined;
}

function getDiskFree(dirPath: string): number {
  try {
    const { bsize, bavail } = fs.statfsSync(dirPath);
    return bsize * bavail;
  } catch {
    return MIN_DISK_FREE;
  }
}

function encodePreview(
  ffmpegBinary: string,
  originalPath: string,
  destinationPath: string,
  inputFormat: string
): Promise<void> {
  const folder = path.dirname(destinationPath);
  const scale =
    "scale=w='min(iw,if(gte(iw,ih),1280,720))':h='min(ih,if(gte(iw,ih),720,1280))'" +
    ":force_original_aspect_ratio=decrease:force_divisible_by=2,fps=fps='min(source_fps,30)'";

  const effectivePath = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    process.env.PATH || "",
  ].filter(Boolean).join(":");

  return new Promise((resolve, reject) => {
    let storageError: PreviewError | undefined;
    const child = execFile(ffmpegBinary, [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-xerror",
      "-protocol_whitelist", "file", "-f", inputFormat, "-threads", "2",
      "-max_pixels", "67108864", "-i", originalPath,
      "-map", "0:V:0", "-map", "0:a:0?", "-map_metadata", "-1", "-map_chapters", "-1",
      "-filter_threads", "1", "-vf", scale,
      "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-crf", "24",
      "-pix_fmt", "yuv420p", "-maxrate", "2200k", "-bufsize", "4400k",
      "-c:a", "aac", "-ac", "2", "-b:a", "128k", "-movflags", "+faststart",
      "-f", "mp4", destinationPath,
    ], {
      timeout: MAX_ENCODING_TIME,
      maxBuffer: 128 * 1024,
      env: { ...process.env, PATH: effectivePath, LANG: "C" },
    }, (error) => {
      clearInterval(storageMonitor);
      if (storageError) {
        reject(storageError);
      } else if (error?.code === "ENOENT") {
        reject(new PreviewError("FFmpeg est introuvable sur le serveur. Installez-le pour générer les aperçus."));
      } else if (error) {
        reject(new PreviewError("Impossible de compresser cette vidéo. Vérifiez le fichier et réessayez."));
      } else {
        resolve();
      }
    });

    const storageMonitor = setInterval(() => {
      updateGlobalLockHeartbeat();
      try {
        if (getDiskFree(folder) < MIN_DISK_FREE) {
          storageError = new PreviewError("Limite d'espace disque atteinte pendant la génération de l'aperçu.");
          child.kill("SIGKILL");
          return;
        }
        const currentSize = fs.statSync(destinationPath, { throwIfNoEntry: false })?.size ?? 0;
        if (currentSize >= MAX_PREVIEW_BYTES) {
          storageError = new PreviewError("La taille de l'aperçu dépasse la limite autorisée de 2 Go.");
          child.kill("SIGKILL");
        }
      } catch {
        storageError = new PreviewError("Le dossier de la vidéo n'est plus accessible.");
        child.kill("SIGKILL");
      }
    }, 2000);
    storageMonitor.unref();
  });
}

export async function generateGalleryVideoPreview(galleryId: string, mediaId: string): Promise<void> {
  const ffmpegBinary = getFfmpegPath();
  if (!ffmpegBinary) {
    throw new PreviewError("FFmpeg est introuvable sur le serveur. Installez-le pour générer les aperçus.");
  }

  const video = findVideo(galleryId, mediaId);
  if (!video) {
    throw new PreviewError("La vidéo n'est plus disponible dans cette galerie.");
  }

  const originalPath = enforceSafeConfinement(ENV.GALLERY_MEDIA_PATH, [galleryId, mediaId]);
  if (!fs.existsSync(originalPath)) {
    throw new PreviewError("Le fichier vidéo original est introuvable.");
  }
  const originalSize = fs.statSync(originalPath).size;

  const finalPreviewPath = getGalleryVideoPreviewPath(galleryId, mediaId);
  const previewsDir = path.dirname(finalPreviewPath);
  fs.mkdirSync(previewsDir, { recursive: true, mode: 0o700 });

  if (getDiskFree(previewsDir) < MIN_DISK_FREE) {
    throw new PreviewError("Espace disque insuffisant sur le serveur pour générer l'aperçu.");
  }

  // Private staging work directory for atomic publishing
  const workDir = fs.mkdtempSync(path.join(previewsDir, ".encoding-"));
  fs.chmodSync(workDir, 0o700);
  const tempDestination = path.join(workDir, PREVIEW_FILENAME);

  try {
    const inputFormat = video.mime_type === "video/webm" ? "matroska" : "mov";
    await encodePreview(ffmpegBinary, originalPath, tempDestination, inputFormat);

    const stat = fs.statSync(tempDestination);
    if (stat.size === 0 || stat.size >= MAX_PREVIEW_BYTES) {
      throw new PreviewError("L'aperçu généré dépasse la limite autorisée ou est vide.");
    }
    if (stat.size >= originalSize) {
      throw new PreviewError("L'aperçu généré n'est pas plus léger que l'original. L'original est conservé pour la lecture.");
    }
    if (!findVideo(galleryId, mediaId)) {
      throw new PreviewError("La vidéo a été supprimée de la galerie pendant l'encodage.");
    }

    fs.chmodSync(tempDestination, 0o600);
    fs.renameSync(tempDestination, finalPreviewPath);
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Starts generating a video preview in the background.
 * Returns started, ready, busy, or not_found.
 */
export function startGalleryVideoPreview(
  galleryId: string,
  mediaId: string
): "started" | "processing" | "ready" | "busy" | "not_found" {
  const video = findVideo(galleryId, mediaId);
  if (!video) return "not_found";

  if (hasGalleryVideoPreview(galleryId, mediaId)) return "ready";
  if (isGalleryVideoPreviewProcessing(galleryId, mediaId)) return "processing";

  const key = `${galleryId}:${mediaId}`;
  if (activeKey || !acquireGlobalLock(galleryId, mediaId)) {
    return "busy";
  }

  activeKey = key;
  failures.delete(key);

  void generateGalleryVideoPreview(galleryId, mediaId)
    .catch((err: unknown) => {
      const msg = err instanceof PreviewError
        ? err.message
        : "Échec de la génération de l'aperçu. Vérifiez que le fichier est accessible, puis réessayez.";
      failures.set(key, msg);
      if (failures.size > 64) {
        const first = failures.keys().next().value;
        if (first !== undefined) failures.delete(first);
      }
    })
    .finally(() => {
      releaseGlobalLock(galleryId, mediaId);
      if (activeKey === key) activeKey = undefined;
    });

  return "started";
}

export function openGalleryVideoForPlayback(
  galleryId: string,
  mediaId: string,
  mimeType: string,
  usePreview: boolean
): { filePath: string; size: number; contentType: string } {
  let filePath: string;
  let contentType: string;

  if (usePreview) {
    filePath = getGalleryVideoPreviewPath(galleryId, mediaId);
    if (!fs.existsSync(filePath)) {
      throw new PreviewError("Aperçu vidéo introuvable.");
    }
    contentType = "video/mp4";
  } else {
    filePath = enforceSafeConfinement(ENV.GALLERY_MEDIA_PATH, [galleryId, mediaId]);
    if (!fs.existsSync(filePath)) {
      throw new PreviewError("Vidéo originale introuvable.");
    }
    contentType = mimeType || "application/octet-stream";
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new PreviewError("L'élément demandé n'est pas un fichier.");
  }

  return {
    filePath,
    size: stat.size,
    contentType,
  };
}
