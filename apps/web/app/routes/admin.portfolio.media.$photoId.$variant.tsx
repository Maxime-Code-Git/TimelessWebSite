import { type LoaderFunctionArgs } from "react-router";
import { Readable } from "node:stream";
import { getPortfolioContent, getPortfolioMediaPath } from "../lib/portfolio-content.server";
import { openPortfolioVariant } from "../lib/portfolio-media.server";
import { requireAdminSession } from "../lib/auth.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { isValid } = await requireAdminSession(request);
  if (!isValid) return new Response("Unauthorized", { status: 401 });

  const { photoId, variant } = params;
  if (!photoId || !variant) {
    return new Response("Not Found", { status: 404 });
  }

  const portfolio = getPortfolioContent();
  const photo = portfolio.photos.find(p => p.id === photoId);

  if (!photo) {
    return new Response("Not Found", { status: 404 });
  }

  const photoVariant = photo.variants.find(candidate => candidate.name === variant);
  if (!photoVariant) return new Response("Not Found", { status: 404 });

  try {
    const { fileHandle, size } = await openPortfolioVariant(
      getPortfolioMediaPath(),
      photoId,
      variant,
      photoVariant.fileId
    );
    const nodeStream = fileHandle.createReadStream({ autoClose: true });

    return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(size),
        "Cache-Control": "private, no-store",
        "Vary": "Cookie",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
