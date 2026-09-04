import { type LoaderFunctionArgs } from "react-router";
import { Readable } from "node:stream";
import { getPortfolioContent, getPortfolioMediaPath } from "../lib/portfolio-content.server";
import { openPortfolioVariant } from "../lib/portfolio-media.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const { projectId, photoId, variant } = params;
  if (!projectId || !photoId || !variant) {
    return new Response("Not Found", { status: 404 });
  }

  const project = getPortfolioContent().projects.find(candidate => (
    candidate.id === projectId && candidate.status === "published"
  ));
  const photo = project?.photos.find(candidate => candidate.id === photoId);
  const photoVariant = photo?.variants.find(candidate => candidate.name === variant);
  if (!photoVariant) return new Response("Not Found", { status: 404 });

  try {
    const { fileHandle, size } = await openPortfolioVariant(
      getPortfolioMediaPath(),
      projectId,
      variant,
      photoVariant.fileId
    );
    const nodeStream = fileHandle.createReadStream({ autoClose: true });

    return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
