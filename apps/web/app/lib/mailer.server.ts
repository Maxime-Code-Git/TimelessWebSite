import nodemailer from "nodemailer";
import { ENV } from "./env.server";

export interface ContactFormData {
  names: string;
  email: string;
  date: string;
  location: string;
  formula: string;
  message: string;
  phone: string;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: ENV.SMTP_HOST,
      port: ENV.SMTP_PORT,
      secure: false, // Port 587 must use secure: false
      requireTLS: true, // Force STARTTLS
      tls: {
        ...(ENV.SMTP_CA_CERT ? { ca: [ENV.SMTP_CA_CERT] } : {})
      },
      auth: {
        user: ENV.SMTP_USER,
        pass: ENV.SMTP_PASS,
      },
      connectionTimeout: 10000,
      socketTimeout: 15000,
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
Téléphone : ${data.phone || "Non précisé"}
Date : ${data.date || "Non précisée"}
Lieu : ${data.location || "Non précisé"}
Formule : ${data.formula}

Message :
${data.message}
  `.trim();

  // The 'from' address MUST be the authorized sender for Brevo
  const fromAddress = ENV.SMTP_FROM;
  const toAddress = ENV.SMTP_TO;

  try {
    const info = await mailer.sendMail({
      from: fromAddress,
      to: toAddress,
      replyTo: data.email, // Visitor's email is set as Reply-To
      subject: "[Timeless] Nouvelle demande de contact",
      text: textBody,
    });

    // Verify that the destination was actually accepted
    if (!info.accepted.includes(toAddress)) {
      throw new Error("SMTP Error: Recipient was not accepted by the mail server.");
    }

    return info;
  } catch (error: unknown) {
    console.error("CONTACT_SMTP_FAILURE");
    throw error;
  }
}
