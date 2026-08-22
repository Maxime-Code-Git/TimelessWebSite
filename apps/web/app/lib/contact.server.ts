import { checkRateLimit } from "./rate-limit.server";
import { sendContactEmail } from "./mailer.server";

import { validateOrigin, getClientIp } from "./security.server";

const MAX_BODY_SIZE = 100 * 1024; // 100 KB

export async function processContactAction(request: Request, lang: "fr" | "en") {
  // Prevent MOCK_SMTP=true backdoor in production entirely
  if (process.env.NODE_ENV === "production" && process.env.MOCK_SMTP) {
    throw new Error("CRITICAL: MOCK_SMTP is strictly forbidden in production.");
  }

  // 1. Content-Type and Body limit (Enforce strict size limit BEFORE and DURING parsing)
  const rawContentType = request.headers.get("content-type") || "";
  const mimeType = rawContentType.split(";")[0]?.trim().toLowerCase();

  if (mimeType !== "multipart/form-data" && mimeType !== "application/x-www-form-urlencoded") {
    return { error: lang === "fr" ? "Type de requête non supporté." : "Unsupported request type." };
  }

  const contentLengthStr = request.headers.get("content-length");
  if (contentLengthStr) {
    if (!/^\d+$/.test(contentLengthStr)) {
      return { error: lang === "fr" ? "La requête est invalide ou trop volumineuse." : "Request payload is invalid or too large." };
    }
    const contentLength = Number(contentLengthStr);
    if (!Number.isSafeInteger(contentLength) || contentLength > MAX_BODY_SIZE) {
      return { error: lang === "fr" ? "La requête est invalide ou trop volumineuse." : "Request payload is invalid or too large." };
    }
  }

  // Strictly check Origin/Same-Origin
  if (!validateOrigin(request)) {
    return { error: lang === "fr" ? "Origine non autorisée ou absente." : "Unauthorized or missing origin." };
  }

  // 2. Stream Bounded Reader
  if (!request.body) {
    return { error: lang === "fr" ? "Requête invalide." : "Invalid request." };
  }

  let totalBytes = 0;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_BODY_SIZE) {
          await reader.cancel("Payload too large");
          return { error: lang === "fr" ? "La requête est trop volumineuse." : "Request payload is too large." };
        }
        chunks.push(value);
      }
    }
  } catch {
    return { error: lang === "fr" ? "Erreur de lecture de la requête." : "Error reading request." };
  }

  // Reconstruct body safely
  const completeBody = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    completeBody.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const safeRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: completeBody,
  });

  // 3. Secure parsing
  let formData: FormData;
  try {
    formData = await safeRequest.formData();
  } catch {
    return { error: lang === "fr" ? "Requête invalide." : "Invalid request." };
  }

  // 4. Honeypot check
  if (formData.get("website")) {
    return { error: lang === "fr" ? "Requête invalide." : "Invalid request." };
  }

  // 5. Validation and Normalization
  const names = formData.get("names")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const date = formData.get("date")?.toString().trim();
  const location = formData.get("location")?.toString().trim();
  const formula = formData.get("formula")?.toString().trim();
  const message = formData.get("message")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim() || "";

  if (!names || !email || !formula || !message || !date || !location) {
    return { error: lang === "fr" ? "Veuillez remplir tous les champs obligatoires." : "Please fill in all required fields." };
  }

  // Strict Max Lengths
  if (names.length > 100 || email.length > 150 || date.length > 50 || location.length > 100 || message.length > 5000 || phone.length > 50) {
    return { error: lang === "fr" ? "Un ou plusieurs champs dépassent la taille maximale autorisée." : "One or more fields exceed the maximum allowed length." };
  }

  // Validate Email strictly
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: lang === "fr" ? "Adresse email invalide." : "Invalid email address." };
  }

  // Anti CRLF injection in email/names (headers)
  if (/[\r\n]/.test(email) || /[\r\n]/.test(names)) {
    return { error: lang === "fr" ? "Caractères non autorisés." : "Unauthorized characters." };
  }

  // Allowed formulas
  const allowedFormulas = ["photo", "film", "duo", "custom", "unknown"];
  if (!allowedFormulas.includes(formula)) {
    return { error: lang === "fr" ? "Formule invalide." : "Invalid formula." };
  }

  // Validate Date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: lang === "fr" ? "Format de date invalide." : "Invalid date format." };
  }
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    return { error: lang === "fr" ? "Date impossible ou invalide." : "Impossible or invalid date." };
  }

  // Validate Phone
  if (phone && !/^[\d\s\-+()]{4,30}$/.test(phone)) {
    return { error: lang === "fr" ? "Format de téléphone invalide." : "Invalid phone format." };
  }

  // 6. Rate Limiting and IP Policy
  const clientIp = getClientIp(request);
  if (!clientIp) {
    return { error: lang === "fr" ? "Configuration réseau invalide ou IP non autorisée." : "Invalid network configuration or unauthorized IP." };
  }

  try {
    checkRateLimit(clientIp);
  } catch {
    return { error: lang === "fr" ? "Trop de tentatives. Veuillez réessayer plus tard." : "Too many attempts. Please try again later." };
  }

  // 7. SMTP Sending
  try {
    await sendContactEmail({
      names,
      email,
      date,
      location,
      formula,
      message,
      phone
    });
    return { success: true };
  } catch {
    // Return localized generic error, hiding exact SMTP failures
    return { error: lang === "fr" ? "Une erreur est survenue lors de l'envoi du message. Veuillez réessayer plus tard." : "An error occurred while sending the message. Please try again later." };
  }
}
