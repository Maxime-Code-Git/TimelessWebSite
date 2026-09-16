export function parseRangeHeader(range: string | null | undefined, size: number): { start: number; end: number } | null {
  if (!range || typeof range !== "string") return null;

  if (!range.startsWith("bytes=")) {
    throw new Error("Invalid range unit");
  }

  const rangeValue = range.substring(6);
  if (rangeValue.includes(",")) {
    throw new Error("Multiple ranges not supported");
  }

  if (rangeValue.startsWith("-")) {
    const suffixStr = rangeValue.substring(1);
    if (!/^\d+$/.test(suffixStr)) throw new Error("Invalid range format");
    const suffix = parseInt(suffixStr, 10);
    if (suffix <= 0) throw new Error("Invalid range values");
    const start = Math.max(0, size - suffix);
    return { start, end: size - 1 };
  } else {
    const match = rangeValue.match(/^(\d+)-(.*)$/);
    if (!match) throw new Error("Invalid range format");

    const startStr = match[1];
    const endStr = match[2];

    if (!/^\d+$/.test(startStr)) throw new Error("Invalid range format");
    if (endStr && !/^\d+$/.test(endStr)) throw new Error("Invalid range format");

    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : size - 1;

    if (start < 0 || start >= size || end >= size || end < start) {
      throw new Error("Invalid range values");
    }

    return { start, end };
  }
}

export function parseWidth(widthParam: string | null): number | null {
  if (!widthParam) return null;
  if (!/^\d+$/.test(widthParam)) throw new Error("Invalid width format");
  const width = parseInt(widthParam, 10);
  if (width !== 480 && width !== 960 && width !== 1440 && width !== 1920) {
    throw new Error("Unsupported width");
  }
  return width;
}

export function parseFormat(formatParam: string | null): "jpeg" | "webp" | "avif" | null {
  if (!formatParam) return null;
  if (formatParam !== "jpeg" && formatParam !== "webp" && formatParam !== "avif") {
    throw new Error("Unsupported format");
  }
  return formatParam;
}
