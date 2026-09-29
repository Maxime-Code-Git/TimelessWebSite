import { type ActionFunctionArgs } from "react-router";
import { validateAdminFormData, createAdminHeaders } from "../lib/admin-auth.server";
import { getBookingDb } from "../lib/db-booking.server";

// Secure headers helper
function secureHeaders(): Headers {
  const headers = createAdminHeaders();
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return headers;
}

// Error response helper
function errorResponse(msg: string, status: number): Response {
  return Response.json({ error: msg }, {
    status,
    headers: secureHeaders()
  });
}

function isValidId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 128 && /^[0-9a-zA-Z_-]+$/.test(id);
}

const BOOKING_EXPORT_COLUMNS = [
  "id", "local_date", "local_time", "starts_at_utc", "ends_at_utc",
  "timezone", "status", "names", "email", "phone", "wedding_date",
  "formula", "message", "language", "created_at", "updated_at"
] as const;

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    const h = secureHeaders();
    h.set("Allow", "POST");
    return new Response("Method Not Allowed", { status: 405, headers: h });
  }

  let formData: FormData;
  try {
    formData = await validateAdminFormData(request);
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    if (err && typeof err === "object" && "name" in err && err.name === "ActionSecurityError") {
      const secErr = err as unknown as { status: number; message: string };
      return new Response(secErr.message, { status: secErr.status, headers: secureHeaders() });
    }
    return new Response("Bad Request", { status: 400, headers: secureHeaders() });
  }

  const id = String(formData.get("id") ?? "");
  if (!isValidId(id)) return errorResponse("Invalid booking ID", 400);

  let booking: unknown;
  try {
    const db = getBookingDb();
    const columnList = BOOKING_EXPORT_COLUMNS.join(", ");
    booking = db.prepare(`SELECT ${columnList} FROM bookings WHERE id = ?`).get(id);
  } catch {
    return new Response("Internal Server Error", { status: 500, headers: secureHeaders() });
  }

  if (!booking) {
    return new Response("Not found", { status: 404, headers: secureHeaders() });
  }

  const json = JSON.stringify(booking, null, 2);
  const h = secureHeaders();
  h.set("Content-Type", "application/json");
  h.set("Content-Disposition", `attachment; filename="booking_export.json"`);
  return new Response(json, { headers: h });
}
