const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/routes/api.gallery.$publicId.media.$mediaId.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// Add the import
content = content.replace(
  'import { Readable } from "node:stream";',
  'import { Readable } from "node:stream";\nimport { parseRangeHeader, parseWidth, parseFormat } from "~/lib/media-utils";'
);

// Replace range parsing
const newRangeLogic = `
      let start: number;
      let end: number;
      try {
        const parsed = parseRangeHeader(range, size);
        if (!parsed) {
          return new Response(null, { status: 416, headers: { "Content-Range": \`bytes */\${size}\`, ...GALLERY_PRIVATE_HEADERS } });
        }
        start = parsed.start;
        end = parsed.end;
      } catch (err) {
        return new Response(null, { status: 416, headers: { "Content-Range": \`bytes */\${size}\`, ...GALLERY_PRIVATE_HEADERS } });
      }
`;
content = content.replace(/let start: number;[\s\S]*?(?=const chunksize = \(end - start\))/, newRangeLogic);

// Replace width and format parsing
const newWidthLogic = `
  const url = new URL(request.url);
  const widthParam = url.searchParams.get("width");
  const formatParam = url.searchParams.get("format");
  let targetWidth = 1920;
  let targetFormat: "jpeg" | "webp" | "avif" | null = null;
  
  try {
    const parsedW = parseWidth(widthParam);
    if (parsedW) targetWidth = parsedW;
    targetFormat = parseFormat(formatParam);
  } catch (err) {
    return new Response("Bad Request", { status: 400, headers: GALLERY_PRIVATE_HEADERS });
  }

  const accept = request.headers.get("Accept") || "";
`;
content = content.replace(/const url = new URL\(request\.url\);[\s\S]*?(?=const formatParam = url\.searchParams\.get\("format"\);)/, newWidthLogic);
content = content.replace(/const formatParam = url\.searchParams\.get\("format"\);\n/g, "");

fs.writeFileSync(filePath, content);
console.log("Updated media route");
