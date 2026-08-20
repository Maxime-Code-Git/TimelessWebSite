import nodemailer from "nodemailer";
import { ENV } from "./env.server";

export interface ContactFormData {
  names: string;
  email: string;
  date: string;
  location: string;
  formula: string;
  message: string;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: ENV.SMTP_HOST,
      port: ENV.SMTP_PORT,
      secure: false, // Use STARTTLS on port 587
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === "production"
      },
      auth: {
        user: ENV.SMTP_USER,
        pass: ENV.SMTP_PASS,
      },
      connectionTimeout: 10000,
      socketTimeout: 10000,
    });
  }
  return transporter;
}

export async function sendContactEmail(data: ContactFormData) {
  const mailer = getTransporter();

  const textBody = `
Nouvelle demande de contact:

Noms : ${data.names}
Email : ${data.email}
Date du mariage : ${data.date || "Non précisée"}
Lieu : ${data.location || "Non précisé"}
Formule : ${data.formula}

Message :
${data.message}
  `.trim();

  // Ensure To address is exactly the configured destination
  const toAddress = ENV.SMTP_TO;

  const info = await mailer.sendMail({
    from: ENV.SMTP_FROM,
    to: toAddress,
    replyTo: data.email,
    subject: "[Timeless] Nouvelle demande de contact",
    text: textBody,
  });

  // Verify that the destination was actually accepted
  if (!info.accepted.includes(toAddress)) {
    throw new Error("SMTP Error: Recipient was not accepted by the mail server.");
  }

  return info;
}
