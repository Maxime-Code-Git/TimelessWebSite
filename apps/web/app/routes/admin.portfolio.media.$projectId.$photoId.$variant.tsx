import { type LoaderFunctionArgs } from "react-router";
import { requireAdminSession } from "../lib/auth.server";
import { getProjectById, getPortfolioMediaPath } from "../lib/portfolio-content.server";
import fs from "node:fs";
import path from "node:path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  console.log("[MEDIA ROUTE START] URL:", request.url);
  try {
    const { isValid } = await requireAdminSession(request);
    if (!isValid) {
      console.log("[MEDIA ROUTE] Session Invalid");
      return new Response("Unauthorized", { status: 401 });
    }
    console.log("[MEDIA ROUTE] Session Valid");

    const { projectId, photoId, variant } = params;

    if (!projectId || !photoId || !variant) {
      console.log("[MEDIA ROUTE] Missing params");
      return new Response("Not Found Params", { status: 404 });
    }

    const project = getProjectById(projectId);
    if (!project) {
      console.log("[MEDIA ROUTE] Project Not Found", projectId);
      return new Response("Not Found Project", { status: 404 });
    }

    const photo = project.photos.find(p => p.id === photoId);
    if (!photo) {
      console.log("[MEDIA ROUTE] Photo Not Found", photoId);
      return new Response("Not Found Photo", { status: 404 });
    }

    const photoVariant = photo.variants.find(v => v.name === variant);
    if (!photoVariant) {
      console.log("[MEDIA ROUTE] Variant Not Found", variant);
      return new Response("Not Found Variant", { status: 404 });
    }

    const mediaBasePath = getPortfolioMediaPath();
    if (!fs.existsSync(mediaBasePath)) {
      console.log("[MEDIA ROUTE] Base path Not Found");
      return new Response("Not Found BasePath", { status: 404 });
    }

    const targetPath = path.join(mediaBasePath, projectId, variant, `${photoVariant.fileId}.webp`);
    console.log("[MEDIA ROUTE] targetPath:", targetPath);

    if (!fs.existsSync(targetPath)) {
      console.log("[MEDIA ROUTE] File Not Found on Disk", targetPath);
      return new Response("Not Found File", { status: 404 });
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId) ||
        !/^[0-9a-z-]+$/i.test(photoVariant.fileId)) {
      console.log("[MEDIA ROUTE] Regex failed", projectId, photoVariant.fileId);
      return new Response("Not Found Regex", { status: 404 });
    }

    const realMediaBase = fs.realpathSync(mediaBasePath);
    const realTarget = fs.realpathSync(targetPath);
    const lstat = fs.lstatSync(targetPath);

    if (lstat.isSymbolicLink() || !realTarget.startsWith(realMediaBase)) {
      console.log("[MEDIA ROUTE] Symlink or path traversal", realTarget, realMediaBase);
      return new Response("Not Found Path Traversal", { status: 404 });
    }

    if (!lstat.isFile()) {
      console.log("[MEDIA ROUTE] Not a file", targetPath);
      return new Response("Not Found Not File", { status: 404 });
    }

    console.log("[MEDIA ROUTE] File Exists and Valid. Returning 200.");
    const headers = new Headers();
    headers.set("Content-Type", "image/webp");
    headers.set("Cache-Control", "no-store, max-age=0");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Length", String(lstat.size));
        const stream = fs.createReadStream(targetPath);
    return new Response(stream as unknown as BodyInit, { headers, status: 200 });

  } catch (err) {
    console.error("[MEDIA ROUTE ERROR]", err);
    throw err;
  }
}
