const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/routes/api.gallery.$publicId.download.original.$mediaId.ts');
let content = fs.readFileSync(filePath, 'utf-8');

const newOriginalLogic = `
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { publicId, mediaId } = params;
  if (!publicId || !mediaId) return new Response("Bad Request", { status: 400, headers: GALLERY_PRIVATE_HEADERS });

  const { gallery, media } = await requireGalleryAccess(request, publicId, mediaId, true);
  if (!media) return new Response("Media not found", { status: 404, headers: GALLERY_PRIVATE_HEADERS });

  const filePath = path.join(ENV.GALLERY_MEDIA_PATH, String(gallery.id), String(media.id));
  if (!fs.existsSync(filePath)) {
    return new Response("File not found", { status: 404, headers: GALLERY_PRIVATE_HEADERS });
  }

  const stat = fs.statSync(filePath);
  const size = stat.size;

  const fileStream = fs.createReadStream(filePath);
  const webStream = Readable.toWeb(fileStream) as ReadableStream;

  request.signal.addEventListener("abort", () => {
    fileStream.destroy();
  });

  const rawName = media.original_name ? String(media.original_name) : "media";
  const baseName = path.basename(rawName);
  const cleanName = baseName.replace(/[\\r\\n\\/\\\\"]/g, "").replace(/[^\\x20-\\x7E]/g, "_");
  const utf8Name = encodeURIComponent(baseName.replace(/[\\/\\\\]/g, ""));
  const contentDisposition = \`attachment; filename="\${cleanName}"; filename*=UTF-8''\${utf8Name}\`;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Length": size.toString(),
      "Content-Type": (media.mime_type as string) || "application/octet-stream",
      "Content-Disposition": contentDisposition,
      ...GALLERY_PRIVATE_HEADERS
    }
  });
}
`;

content = content.replace(/export async function loader[\s\S]*$/, newOriginalLogic);
fs.writeFileSync(filePath, content);
console.log("Updated original route");
