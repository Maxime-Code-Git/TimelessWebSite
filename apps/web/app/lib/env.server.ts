/**
 * Validates and exposes server environment variables safely.
 * Throws an error at startup if required variables are missing or invalid,
 * without exposing secrets in logs.
 */
import "../../../../scripts/env-loader.js";

export function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`CRITICAL: Environment variable ${name} is missing. Please check your .env files.`);
  }
  return value;
}

export const ENV = {
  get PUBLIC_SITE_URL() {
    const url = requireEnvVar("PUBLIC_SITE_URL");
    try {
      new URL(url);
    } catch {
      throw new Error("CRITICAL: PUBLIC_SITE_URL is not a valid URL.");
    }
    return url;
  },
  get SMTP_HOST() {
    return requireEnvVar("SMTP_HOST");
  },
  get SMTP_PORT() {
    const port = parseInt(requireEnvVar("SMTP_PORT"), 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error("CRITICAL: SMTP_PORT must be an integer between 1 and 65535.");
    }
    return port;
  },
  get SMTP_USER() {
    return requireEnvVar("SMTP_USER");
  },
  get SMTP_PASS() {
    return requireEnvVar("SMTP_PASS");
  },
  get SMTP_CA_CERT() {
    return process.env.SMTP_CA_CERT || "";
  },
  get SMTP_FROM() {
    const from = requireEnvVar("SMTP_FROM").trim();
    if (!from) throw new Error("CRITICAL: SMTP_FROM cannot be empty.");
    return from;
  },
  get SMTP_TO() {
    const to = requireEnvVar("SMTP_TO").trim();
    if (!to) throw new Error("CRITICAL: SMTP_TO cannot be empty.");
    return to;
  },
  get CONTACT_RATE_LIMIT_SECRET() {
    return requireEnvVar("CONTACT_RATE_LIMIT_SECRET");
  },
  get RATE_LIMIT_DB_PATH() {
    return requireEnvVar("RATE_LIMIT_DB_PATH");
  },
  get CONTACT_RATE_LIMIT_MAX() {
    // Will read from CONTACT_RATE_LIMIT_MAX or default to 5
    const val = process.env.CONTACT_RATE_LIMIT_MAX || "5";
    const max = parseInt(val, 10);
    if (isNaN(max) || max < 1 || max > 100) {
      throw new Error("CRITICAL: CONTACT_RATE_LIMIT_MAX must be an integer between 1 and 100.");
    }
    return max;
  },
  get TRUST_PROXY() {
    const trustProxy = process.env.TRUST_PROXY === "true";
    if (process.env.NODE_ENV === "production" && !trustProxy) {
      throw new Error("CRITICAL: TRUST_PROXY=true is required in production. The application must run behind a reverse proxy that sets X-Forwarded-For securely.");
    }
    return trustProxy;
  }
};

// Fail fast on startup by forcing evaluation
void ENV.PUBLIC_SITE_URL;
void ENV.SMTP_PORT;
void ENV.SMTP_FROM;
void ENV.SMTP_TO;
void ENV.CONTACT_RATE_LIMIT_MAX;
void ENV.TRUST_PROXY;
