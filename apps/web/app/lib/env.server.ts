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
    return requireEnvVar("PUBLIC_SITE_URL");
  },
  get SMTP_HOST() {
    return requireEnvVar("SMTP_HOST");
  },
  get SMTP_PORT() {
    return parseInt(requireEnvVar("SMTP_PORT"), 10);
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
    return requireEnvVar("SMTP_FROM");
  },
  get SMTP_TO() {
    return requireEnvVar("SMTP_TO");
  },
  get CONTACT_RATE_LIMIT_SECRET() {
    return requireEnvVar("CONTACT_RATE_LIMIT_SECRET");
  },
  get RATE_LIMIT_DB_PATH() {
    return requireEnvVar("RATE_LIMIT_DB_PATH");
  },
  get TRUST_PROXY() {
    return process.env.TRUST_PROXY === "true";
  }
};
