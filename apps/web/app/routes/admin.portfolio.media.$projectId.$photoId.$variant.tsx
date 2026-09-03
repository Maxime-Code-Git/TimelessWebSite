import { type LoaderFunctionArgs } from "react-router";
import { requireValidAdminSession } from "../lib/admin-auth.server";
import { getProjectById, getPortfolioMediaPath } from "../lib/portfolio-content.server";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    await requireValidAdminSession(request);
  } catch (err) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { projectId, photoId, variant } = params;

  if (!projectId || !photoId || !variant) {
    return new Response("Not Found", { status: 404 });
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    return new Response("Not Found", { status: 404 });
  }

  const project = getProjectById(projectId);
  if (!project) {
    return new Response("Not Found", { status: 404 });
  }

  const photo = project.photos.find(p => p.id === photoId);
  if (!photo) {
    return new Response("Not Found", { status: 404 });
  }

  const photoVariant = photo.variants.find(v => v.name === variant);
  if (!photoVariant) {
    return new Response("Not Found", { status: 404 });
  }

  if (!/^[0-9a-z-]+$/i.test(photoVariant.fileId)) {
    return new Response("Not Found", { status: 404 });
  }

  const mediaBasePath = getPortfolioMediaPath();
  const targetPath = path.resolve(mediaBasePath, projectId, variant, `${photoVariant.fileId}.webp`);

  const rel = path.relative(path.resolve(mediaBasePath), targetPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return new Response("Not Found", { status: 404 });
  }

  let fileHandle: fsPromises.FileHandle | null = null;
  try {
    fileHandle = await fsPromises.open(targetPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = await fileHandle.stat();

    if (!stat.isFile()) {
      await fileHandle.close();
      return new Response("Not Found", { status: 404 });
    }

    const headers = new Headers();
    headers.set("Content-Type", "image/webp");
    headers.set("Cache-Control", "no-store, max-age=0");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Length", String(stat.size));
    headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; sandbox");

    const nodeStream = fileHandle.createReadStream();

    // Convert Node Readable to Web ReadableStream for standard Response
    const webStream = Readable.toWeb(nodeStream);

    return new Response(webStream as ReadableStream, { headers, status: 200 });
  } catch (err: unknown) {
    if (fileHandle) {
      await fileHandle.close().catch(() => {});
    }
    return new Response("Not Found", { status: 404 });
  }
}
