import { checkRateLimit } from "./rate-limit.server";
import { sendContactEmail } from "./mailer.server";
import { ENV } from "./env.server";

export async function processContactAction(request: Request, lang: "fr" | "en") {
  // Prevent MOCK_SMTP=true backdoor in production entirely
  if (process.env.NODE_ENV === "production" && process.env.MOCK_SMTP) {
    throw new Error("CRITICAL: MOCK_SMTP is strictly forbidden in production.");
  }

  // Strictly check Origin/Same-Origin (CSRF defense-in-depth)
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).origin !== new URL(ENV.PUBLIC_SITE_URL).origin) {
    return { error: lang === "fr" ? "Origine non autorisée." : "Unauthorized origin." };
  }

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
    
    // Basic validation of IP format to avoid spoofed strings causing issues
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(clientIp) && !/^([0-9a-fA-F:]+)$/.test(clientIp)) {
      return { error: lang === "fr" ? "Adresse IP invalide." : "Invalid IP address." };
    }
  }

  // Rate Limiting
  try {
    checkRateLimit(clientIp);
  } catch {
    return { error: lang === "fr" ? "Trop de tentatives. Veuillez réessayer plus tard." : "Too many attempts. Please try again later." };
  }

  // Parse body
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return { error: lang === "fr" ? "Requête invalide." : "Invalid request." };
  }

  // Check Honeypot
  if (formData.get("website")) {
    // Silently drop
    return { success: true };
  }

  // Validate fields
  const names = formData.get("names")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const date = formData.get("date")?.toString().trim() || "";
  const location = formData.get("location")?.toString().trim() || "";
  const formula = formData.get("formula")?.toString().trim();
  const message = formData.get("message")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim() || "";

  if (!names || !email || !formula || !message) {
    return { error: lang === "fr" ? "Veuillez remplir tous les champs obligatoires." : "Please fill in all required fields." };
  }

  // Length limits
  if (names.length > 100 || email.length > 100 || date.length > 50 || location.length > 100 || message.length > 5000 || phone.length > 50) {
    return { error: lang === "fr" ? "Un ou plusieurs champs dépassent la taille maximale autorisée." : "One or more fields exceed the maximum allowed length." };
  }

  // Validate Email
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

  // Send Email
  try {
    await sendContactEmail({
      names,
      email,
      date,
      location,
      formula,
      message: `${message}\n\nTéléphone: ${phone}`
    });
    return { success: true };
  } catch (err) {
    console.error("SMTP Delivery Error:", err);
    return { error: lang === "fr" ? "Une erreur est survenue lors de l'envoi du message. Veuillez réessayer plus tard." : "An error occurred while sending the message. Please try again later." };
  }
}
