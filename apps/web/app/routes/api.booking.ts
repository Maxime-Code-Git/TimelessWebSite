import { type ActionFunctionArgs, data as json } from "react-router";
import { z } from "zod";
import { getAvailableSlots, createPendingBooking } from "../lib/booking.server";
import { sendBookingRequestEmails } from "../lib/mailer.server";
import { checkRateLimit } from "../lib/rate-limit.server";
import { validateOrigin, getClientIp } from "../lib/security.server";

// Validates that the date is a real calendar date (e.g., rejects 2026-02-30)
function isValidCivilDate(dateStr: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

const bookingSchema = z.object({
  date: z.string().refine(isValidCivilDate, { message: "Invalid date" }),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  names: z.string().min(1).max(100),
  email: z.string().email().max(100),
  phone: z.string().max(50).optional(),
  wedding_date: z.string().max(50).optional(),
  formula: z.string().max(50).optional(),
  message: z.string().max(2000).optional(),
  language: z.enum(["fr", "en"]),
  honeypot: z.string().max(100).optional()
}).strict();

export async function loader() {
  const slots = getAvailableSlots();
  return json({ slots }, {
    headers: { "Cache-Control": "no-store" }
  });
}

async function readBoundedJson(request: Request, limitBytes: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;

  let totalBytes = 0;
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.length;
        if (totalBytes > limitBytes) {
          await reader.cancel("Payload too large");
          throw new Error("PAYLOAD_TOO_LARGE");
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const all = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }

  const text = new TextDecoder().decode(all);
  if (!text) return null;
  return JSON.parse(text);
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: {
        "Allow": "POST",
        "Cache-Control": "no-store",
        "Content-Type": "application/json"
      }
    });
  }

  if (!validateOrigin(request)) {
    return json({ error: "Forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const ip = getClientIp(request);
  if (!ip) {
    return json({ error: "Bad Request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    checkRateLimit(ip, "booking");
  } catch {
    return json({ error: "Too many requests" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }

  const rawContentType = request.headers.get("Content-Type");
  if (!rawContentType) {
    return json({ error: "Unsupported Media Type" }, { status: 415, headers: { "Cache-Control": "no-store" } });
  }

  const contentType = rawContentType.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return json({ error: "Unsupported Media Type" }, { status: 415, headers: { "Cache-Control": "no-store" } });
  }

  let rawData: unknown;
  try {
    rawData = await readBoundedJson(request, 32 * 1024); // 32 KB limit
  } catch (err) {
    if (err instanceof Error && err.message === "PAYLOAD_TOO_LARGE") {
      return json({ error: "Payload Too Large" }, { status: 413, headers: { "Cache-Control": "no-store" } });
    }
    return json({ error: "Bad Request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  if (typeof rawData !== 'object' || rawData === null) {
    return json({ error: "Bad Request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const parsed = bookingSchema.safeParse(rawData);
  if (!parsed.success) {
    return json({ error: "Invalid data" }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }

  if (parsed.data.honeypot) {
    // Return 201 silently for bots
    return json({ success: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  }

  try {
    createPendingBooking(parsed.data);

    // Email sending without failing the mutation
    try {
      await sendBookingRequestEmails(parsed.data);
    } catch {
      // SMTP failure logged internally by mailer.server.ts
      return json({ success: true, warning: "SMTP_DELIVERY_FAILED" }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    return json({ success: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "ALREADY_BOOKED") {
      return json({ error: "SLOT_TAKEN" }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    return json({ error: "Internal Server Error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
