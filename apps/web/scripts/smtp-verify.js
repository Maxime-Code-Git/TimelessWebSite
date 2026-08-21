import "../../../scripts/env-loader.js";
import nodemailer from "nodemailer";

// Verify required env vars are loaded
const requiredVars = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SMTP_TO"];
let missing = false;
for (const envVar of requiredVars) {
  if (!process.env[envVar]) {
    console.error(`[smtp:verify] Error: Environment variable ${envVar} is missing.`);
    missing = true;
  }
}

if (missing) {
  console.error("[smtp:verify] Verification failed due to missing configuration.");
  process.exit(1);
}

const host = process.env.SMTP_HOST;
const port = parseInt(process.env.SMTP_PORT || "587", 10);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

console.log(`[smtp:verify] Verifying connection to ${host}:${port}...`);
console.log(`[smtp:verify] Using user: ${user ? "HIDDEN" : "NONE"}`);

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: false, // Must be false for port 587
  requireTLS: true,
  auth: { user, pass },
  connectionTimeout: 10000,
  socketTimeout: 15000,
});

transporter.verify()
  .then(() => {
    console.log("[smtp:verify] ✅ SMTP Connection successful and ready to send messages!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[smtp:verify] ❌ SMTP Verification failed!");
    // Hide raw error message that might expose credentials or inner workings if needed
    // But verify() usually returns safe network errors or generic auth failures.
    if (err.response) {
      console.error(`[smtp:verify] Server responded with: ${err.response}`);
    } else {
      console.error(`[smtp:verify] Error: ${err.message}`);
    }
    process.exit(1);
  });
