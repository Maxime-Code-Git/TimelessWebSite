
import { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import type { Route } from "./+types/media.home.$section.$imageId.$variant.$ext";

export async function loader({ request, params }: Route.LoaderArgs) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const { section, imageId, variant, ext } = params;

  if (!section || !["hero", "portfolio-photo", "portfolio-video", "studio"].includes(section)) {
    return new Response("Not Found", { status: 404 });
  }

  if (!imageId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(imageId)) {
    return new Response("Not Found", { status: 404 });
  }

  if (!variant || !["640p", "960p", "1440p", "1920p"].includes(variant)) {
    return new Response("Not Found", { status: 404 });
  }

  if (!ext || !["webp", "avif"].includes(ext)) {
    return new Response("Not Found", { status: 404 });
  }

  const mediaBasePath = process.env.SITE_MEDIA_PATH || path.join(process.cwd(), "data", "media", "site");
  const resolvedMediaBasePath = path.resolve(mediaBasePath);

  const fileId = `${imageId}-${variant}`;
  const filePath = path.resolve(
    resolvedMediaBasePath,
    "home",
    section,
    imageId,
    variant,
    `${fileId}.${ext}`
  );

  const rel = path.relative(resolvedMediaBasePath, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return new Response("Not Found", { status: 404 });
  }

  let handle: fs.promises.FileHandle | null = null;
  try {
    handle = await fs.promises.open(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = await handle.stat();

    if (!stat.isFile()) {
      await handle.close();
      handle = null;
      return new Response("Not Found", { status: 404 });
    }

    const contentType = ext === "webp" ? "image/webp" : "image/avif";

    // ETag based on mtime and size, simple and effective
    const etag = `W/"${stat.size.toString(16)}-${stat.mtime.getTime().toString(16)}"`;

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Content-Length", stat.size.toString());
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("ETag", etag);

    if (request.method === "HEAD") {
      await handle.close();
      handle = null;
      return new Response(null, { status: 200, headers });
    }

    const stream = handle.createReadStream({ autoClose: true });
    handle = null; // Let the stream manage the handle

    const webStream = Readable.toWeb(stream);

    return new Response(webStream as ReadableStream, { status: 200, headers });
  } catch {
    if (handle) {
      await handle.close().catch(() => {});
    }
    return new Response("Not Found", { status: 404 });
  }
}
