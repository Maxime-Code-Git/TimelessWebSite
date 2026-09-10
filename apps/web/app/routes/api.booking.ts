import { type ActionFunctionArgs, data as json } from "react-router";
import { z } from "zod";
import { getAvailableSlots, createPendingBooking } from "../lib/booking.server";
import { sendBookingRequestEmails } from "../lib/mailer.server";
import { checkRateLimit, resetRateLimit } from "../lib/rate-limit.server";
import { ENV } from "../lib/env.server";

const bookingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST", "Cache-Control": "no-store" } });
  }

  const origin = request.headers.get("Origin");
  if (!origin || origin !== ENV.PUBLIC_SITE_URL) {
    return json({ error: "Forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
  try {
    checkRateLimit(ip, "booking");
  } catch {
    return json({ error: "Too many requests" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }

  let formData: FormData;
  try {
    // Limit body size for security if stream is exposed, but Remix formData parser is reasonably safe.
    formData = await request.formData();
  } catch {
    return json({ error: "Bad Request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const rawData: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      rawData[key] = value.trim();
    }
  }
  
  if (rawData.honeypot) {
    return json({ success: true });
  }

  // Remove empty optionals to satisfy Zod
  if (!rawData.phone) delete rawData.phone;
  if (!rawData.wedding_date) delete rawData.wedding_date;
  if (!rawData.formula) delete rawData.formula;
  if (!rawData.message) delete rawData.message;
  if (!rawData.honeypot) delete rawData.honeypot;

  const parsed = bookingSchema.safeParse(rawData);
  if (!parsed.success) {
    return json({ error: "Invalid data", details: parsed.error.issues }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const booking = createPendingBooking(parsed.data);
    
    resetRateLimit(ip, "booking");

    await sendBookingRequestEmails(parsed.data);

    return json({ success: true, bookingId: booking.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "ALREADY_BOOKED") {
      return json({ error: "SLOT_TAKEN" }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    // Mask details
    return json({ error: "Internal Server Error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
