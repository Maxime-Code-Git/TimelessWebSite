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
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error();
      }
    } catch {
      throw new Error("CRITICAL: PUBLIC_SITE_URL is not a valid URL or does not use HTTP or HTTPS protocol.");
    }
    return url;
  },
  get SMTP_HOST() {
    return requireEnvVar("SMTP_HOST");
  },
  get SMTP_PORT() {
    const portStr = requireEnvVar("SMTP_PORT");
    if (!/^\d+$/.test(portStr)) {
      throw new Error("CRITICAL: SMTP_PORT must contain only digits.");
    }
    const port = Number(portStr);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
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
    const val = process.env.CONTACT_RATE_LIMIT_MAX || "5";
    if (!/^\d+$/.test(val)) {
      throw new Error("CRITICAL: CONTACT_RATE_LIMIT_MAX must contain only digits.");
    }
    const max = Number(val);
    if (!Number.isSafeInteger(max) || max < 1 || max > 100) {
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
void ENV.SMTP_HOST;
void ENV.SMTP_USER;
void ENV.SMTP_PASS;
void ENV.SMTP_FROM;
void ENV.SMTP_TO;
void ENV.CONTACT_RATE_LIMIT_SECRET;
void ENV.RATE_LIMIT_DB_PATH;
void ENV.SMTP_PORT;
void ENV.PUBLIC_SITE_URL;
void ENV.CONTACT_RATE_LIMIT_MAX;
void ENV.TRUST_PROXY;
