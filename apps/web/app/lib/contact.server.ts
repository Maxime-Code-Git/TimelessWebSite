import { checkRateLimit } from "./rate-limit.server";
import { sendContactEmail } from "./mailer.server";
import { ENV } from "./env.server";
import * as net from "node:net";

export async function processContactAction(request: Request, lang: "fr" | "en") {
  // Prevent MOCK_SMTP=true backdoor in production entirely
  if (process.env.NODE_ENV === "production" && process.env.MOCK_SMTP) {
    throw new Error("CRITICAL: MOCK_SMTP is strictly forbidden in production.");
  }

  // 1. Body limit (Enforce strict size limit BEFORE parsing)
  // 100KB should be more than enough for a simple text form.
  const MAX_BODY_SIZE = 100 * 1024;
  const contentLengthStr = request.headers.get("content-length");
  if (contentLengthStr) {
    const contentLength = parseInt(contentLengthStr, 10);
    if (contentLength > MAX_BODY_SIZE) {
      return { error: lang === "fr" ? "La requête est trop volumineuse." : "Request payload is too large." };
    }
  }

  // Strictly check Origin/Same-Origin (CSRF defense-in-depth)
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).origin !== new URL(ENV.PUBLIC_SITE_URL).origin) {
    return { error: lang === "fr" ? "Origine non autorisée." : "Unauthorized origin." };
  }

  // 2. Secure parsing
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return { error: lang === "fr" ? "Requête invalide." : "Invalid request." };
  }

  // 3. Honeypot check
  if (formData.get("website")) {
    // Fail silently to the bot by returning a validation error?
    // The user requested: "Le honeypot ne doit jamais envoyer d'e-mail. Il ne doit pas non plus produire un succès visible affirmant que le message a été envoyé...".
    return { error: lang === "fr" ? "Requête invalide." : "Invalid request." };
  }

  // 4. Validation and Normalization
  const names = formData.get("names")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const date = formData.get("date")?.toString().trim(); // Make sure this is checked! User said 'date ou lieu absent (champs obligatoires)'
  const location = formData.get("location")?.toString().trim();
  const formula = formData.get("formula")?.toString().trim();
  const message = formData.get("message")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim() || "";

  if (!names || !email || !formula || !message || !date || !location) {
    console.error("[DEBUG] Missing fields:", { names, email, formula, message, date, location });
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

  // 5. Rate Limiting (done AFTER validation so invalid requests don't waste DB space, but attackers could spam invalid ones. However, we extract IP reliably)
  // Extract IP safely
  let clientIp = "127.0.0.1";
  if (ENV.TRUST_PROXY) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (!forwardedFor) {
      // If we trust proxy but no header is found, drop the request
      return { error: lang === "fr" ? "Configuration réseau invalide." : "Invalid network configuration." };
    }
    // Safely take the first IP in the chain (set by the trusted proxy)
    clientIp = forwardedFor.split(",")[0].trim();

    // Strict IP validation using net.isIP
    if (!net.isIP(clientIp)) {
      console.error(`[DEBUG] Invalid IP detected: ${clientIp}`);
      return { error: lang === "fr" ? "Adresse IP invalide." : "Invalid IP address." };
    }
  } else {
    // If we don't trust proxy, we shouldn't read x-forwarded-for.
    // We would read the actual socket IP, but in Remix/React Router standard Request, socket IP isn't available directly on Request.
    // Usually it's passed via loadContext from the server adapter.
    // For now, if TRUST_PROXY is false, we rely on a fallback or loadContext if provided.
  }

  try {
    checkRateLimit(clientIp);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[DEBUG] Rate limit block hit for IP ${clientIp}. Error:`, errMsg);
    // Rate limit hit
    return { error: lang === "fr" ? "Trop de tentatives. Veuillez réessayer plus tard." : "Too many attempts. Please try again later." };
  }

  // 6. SMTP Sending
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
