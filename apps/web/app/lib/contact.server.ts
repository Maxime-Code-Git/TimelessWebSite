import { checkRateLimit } from "./rate-limit.server";
import { sendContactEmail, type ContactAddonInfo } from "./mailer.server";

import { validateOrigin, getClientIp } from "./security.server";
import { getSiteContent } from "./site-content.server";

const MAX_BODY_SIZE = 100 * 1024; // 100 KB

export async function processContactAction(
  request: Request,
  lang: "fr" | "en",
) {
  const siteContent = getSiteContent();
  // Prevent MOCK_SMTP=true backdoor in production entirely
  if (process.env.NODE_ENV === "production" && process.env.MOCK_SMTP) {
    throw new Error("CRITICAL: MOCK_SMTP is strictly forbidden in production.");
  }

  // 1. Content-Type and Body limit (Enforce strict size limit BEFORE and DURING parsing)
  const rawContentType = request.headers.get("content-type") || "";
  const mimeType = rawContentType.split(";")[0]?.trim().toLowerCase();

  if (
    mimeType !== "multipart/form-data" &&
    mimeType !== "application/x-www-form-urlencoded"
  ) {
    return {
      error: siteContent.contactPage.contactForm.errors.invalidType[lang],
    };
  }

  const contentLengthStr = request.headers.get("content-length");
  if (contentLengthStr) {
    if (!/^\d+$/.test(contentLengthStr)) {
      return {
        error: siteContent.contactPage.contactForm.errors.payloadTooLarge[lang],
      };
    }
    const contentLength = Number(contentLengthStr);
    if (!Number.isSafeInteger(contentLength) || contentLength > MAX_BODY_SIZE) {
      return {
        error: siteContent.contactPage.contactForm.errors.payloadTooLarge[lang],
      };
    }
  }

  // Strictly check Origin/Same-Origin
  if (!validateOrigin(request)) {
    return {
      error: siteContent.contactPage.contactForm.errors.invalidOrigin[lang],
    };
  }

  // 2. Stream Bounded Reader
  if (!request.body) {
    return {
      error: siteContent.contactPage.contactForm.errors.invalidRequest[lang],
    };
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
          return {
            error:
              siteContent.contactPage.contactForm.errors.payloadTooLarge[lang],
          };
        }
        chunks.push(value);
      }
    }
  } catch {
    return {
      error: siteContent.contactPage.contactForm.errors.readError[lang],
    };
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
    return {
      error: siteContent.contactPage.contactForm.errors.invalidRequest[lang],
    };
  }

  // 4. Honeypot check
  if (formData.get("website")) {
    return {
      error: siteContent.contactPage.contactForm.errors.invalidRequest[lang],
    };
  }

  // 5. Validation and Normalization
  const names = formData.get("names")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const date = formData.get("date")?.toString().trim();
  const location = formData.get("location")?.toString().trim();
  const formula = formData.get("formula")?.toString().trim();
  const message = formData.get("message")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim() || "";
  const addons = formData.getAll("addons").map(a => a.toString().trim());

  if (!names || !email || !formula || !message || !date || !location) {
    return {
      error: siteContent.contactPage.contactForm.errors.requiredFields[lang],
    };
  }

  // Strict Max Lengths
  if (
    names.length > 100 ||
    email.length > 150 ||
    formula.length > 50 ||
    date.length > 50 ||
    location.length > 100 ||
    message.length > 5000 ||
    phone.length > 50
  ) {
    return {
      error: siteContent.contactPage.contactForm.errors.maxLength[lang],
    };
  }

  // Validate Email strictly
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      error: siteContent.contactPage.contactForm.errors.invalidEmail[lang],
    };
  }

  // Anti CRLF injection in email/names (headers)
  if (/[\r\n]/.test(email) || /[\r\n]/.test(names)) {
    return {
      error: siteContent.contactPage.contactForm.errors.invalidChars[lang],
    };
  }

  // Allowed formulas
  let readableFormulaLabel;
  if (formula === "custom") {
    readableFormulaLabel = lang === "fr" ? "Sur-mesure" : "Custom";
  } else if (formula === "unknown") {
    readableFormulaLabel =
      lang === "fr" ? "Ne sait pas encore" : "Not sure yet";
  } else {
    const parts = formula.split("-");
    const cat = parts[0];

    if (cat !== "photo" && cat !== "film" && cat !== "duo") {
      return {
        error: siteContent.contactPage.contactForm.errors.invalidFormula[lang],
      };
    }

    const formulas =
      siteContent.pricing[cat as keyof typeof siteContent.pricing] || [];
    const matched = formulas.find(
      (f) => f.enabled && formula === `${cat}-${f.id}`,
    );
    if (!matched) {
      return {
        error: siteContent.contactPage.contactForm.errors.invalidFormula[lang],
      };
    }
    const catLabel =
      cat === "photo"
        ? lang === "fr"
          ? "Photographie"
          : "Photography"
        : cat === "film"
          ? "Film"
          : "Duo";
    readableFormulaLabel = `[${catLabel}] ${matched.name[lang]} (${formula})`;
  }

  // Validate Addons securely
  const resolvedAddons: ContactAddonInfo[] = [];
  
  if (addons.length > 0) {
    if (formula === "custom" || formula === "unknown") {
      return { error: siteContent.contactPage.contactForm.errors.invalidRequest[lang] };
    }
  }

  if (formula !== "custom" && formula !== "unknown") {
    const [cat, fid] = formula.split("-");
    const siteAddOns = siteContent.pricingPage.addOns || [];

    // reject duplicate
    if (new Set(addons).size !== addons.length) {
      return { error: siteContent.contactPage.contactForm.errors.invalidRequest[lang] };
    }

    for (const addonId of addons) {
      const matchedAddon = siteAddOns.find(a => a.id === addonId);
      if (!matchedAddon || !matchedAddon.enabled) {
        return { error: siteContent.contactPage.contactForm.errors.invalidRequest[lang] };
      }
      const placement = matchedAddon.placements.find(p => p.category === cat && p.formulaId === fid);
      if (!placement || placement.mode !== "optional") {
        return { error: siteContent.contactPage.contactForm.errors.invalidRequest[lang] };
      }
      resolvedAddons.push({
        name: matchedAddon.name[lang],
        status: "added",
        priceCents: matchedAddon.priceCents
      });
    }

    // Auto-inject included/unselected addons
    for (const siteAddOn of siteAddOns) {
      if (siteAddOn.enabled) {
        const placement = siteAddOn.placements.find(p => p.category === cat && p.formulaId === fid);
        if (placement && placement.mode === "included") {
           resolvedAddons.push({ name: siteAddOn.name[lang], status: "included" });
        } else if (placement && placement.mode === "optional" && !addons.includes(siteAddOn.id)) {
           resolvedAddons.push({ name: siteAddOn.name[lang], status: "unselected" });
        }
      }
    }
  }

  // Validate Date
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      error: siteContent.contactPage.contactForm.errors.invalidDateFormat[lang],
    };
  }
  const parsedDate = new Date(date);
  if (
    isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    return {
      error: siteContent.contactPage.contactForm.errors.invalidDate[lang],
    };
  }

  // Validate Phone
  if (phone && !/^[\d\s\-+()]{4,30}$/.test(phone)) {
    return {
      error: siteContent.contactPage.contactForm.errors.invalidPhone[lang],
    };
  }

  // 6. Rate Limiting and IP Policy
  const clientIp = getClientIp(request);
  if (!clientIp) {
    return {
      error: siteContent.contactPage.contactForm.errors.invalidNetwork[lang],
    };
  }

  try {
    checkRateLimit(clientIp);
  } catch {
    return {
      error: siteContent.contactPage.contactForm.errors.rateLimit[lang],
    };
  }

  // 7. SMTP Sending
  try {
    await sendContactEmail({
      names,
      email,
      date,
      location,
      formula: readableFormulaLabel,
      addons: resolvedAddons,
      message,
      phone,
    });
    return { success: true };
  } catch {
    // Return localized generic error, hiding exact SMTP failures
    return {
      error: siteContent.contactPage.contactForm.errors.sendError[lang],
    };
  }
}
