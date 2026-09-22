import { type LoaderFunctionArgs } from "react-router";
import { Readable } from "node:stream";
import { getPortfolioContent, getPortfolioMediaPath } from "../lib/portfolio-content.server";
import { openPortfolioVariant } from "../lib/portfolio-media.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { photoId, variant, ext } = params;
  if (!photoId || !variant || !ext) {
    return new Response("Not Found", { status: 404 });
  }

  const allowedExts = new Set(["avif", "webp", "jpeg", "png"]);
  if (!allowedExts.has(ext)) {
    return new Response("Not Found", { status: 404 });
  }

  const portfolio = getPortfolioContent();
  const video = portfolio.video;
  if (!video || !video.cover || video.cover.imageId !== photoId) {
    return new Response("Not Found", { status: 404 });
  }

  const photoVariant = video.cover.variants.find(candidate => candidate.name === variant);
  if (!photoVariant) return new Response("Not Found", { status: 404 });

  try {
    const { fileHandle, size } = await openPortfolioVariant(
      getPortfolioMediaPath(),
      photoId,
      variant,
      `${video.cover.imageId}-${variant}`,
      ext
    );

    const headers = new Headers({
      "Content-Type": `image/${ext === "jpg" ? "jpeg" : ext}`,
      "Content-Length": String(size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
    });

    if (request.method === "HEAD") {
      fileHandle.close();
      return new Response(null, { status: 200, headers });
    }

    const nodeStream = fileHandle.createReadStream({ autoClose: true });
    return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
      status: 200,
      headers,
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
