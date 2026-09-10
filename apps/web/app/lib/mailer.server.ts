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
      subject: "[Sempra] Nouvelle demande de contact",
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

import type { Booking } from "./booking.server";

export async function sendBookingRequestEmails(data: Record<string, string>) {
  const mailer = getTransporter();
  const fromAddress = ENV.SMTP_FROM;
  const toAddress = ENV.SMTP_TO;

  const textClient = data.language === 'en'
    ? `Hello ${data.names},\n\nWe have received your request for a video meeting on ${data.date} at ${data.time} (Brussels time).\n\nPlease note this request is currently PENDING. We will review it and send you a confirmation with the video link shortly.\n\nSempra`
    : `Bonjour ${data.names},\n\nNous avons bien reçu votre demande de rendez-vous visio pour le ${data.date} à ${data.time} (Heure de Bruxelles).\n\nVeuillez noter que cette demande est EN ATTENTE de validation. Nous vous enverrons une confirmation avec le lien de connexion très prochainement.\n\nSempra`;

  const textAdmin = `Nouvelle demande de rendez-vous visio:\n\nNoms : ${data.names}\nEmail : ${data.email}\nDate : ${data.date} à ${data.time}\nTéléphone : ${data.phone || "Non précisé"}\nFormule : ${data.formula || "Non précisée"}\nDate mariage: ${data.wedding_date || "Non précisée"}\n\nMessage :\n${data.message || ""}`;

  try {
    // Send to client
    await mailer.sendMail({
      from: fromAddress,
      to: data.email,
      subject: data.language === 'en' ? "[Sempra] Video appointment request received" : "[Sempra] Demande de rendez-vous visio reçue",
      text: textClient,
    });
    // Send to admin
    await mailer.sendMail({
      from: fromAddress,
      to: toAddress,
      replyTo: data.email,
      subject: `[Sempra] Nouvelle demande visio : ${data.date} ${data.time}`,
      text: textAdmin,
    });
  } catch {
    // We swallow the error so booking succeeds, but we log the failure code (not data)
    console.error("BOOKING_SMTP_FAILURE_REQUEST");
  }
}

export async function sendBookingConfirmedEmail(data: Booking) {
  const mailer = getTransporter();
  const fromAddress = ENV.SMTP_FROM;

  const textClient = data.language === 'en'
    ? `Hello ${data.names},\n\nYour video appointment on ${data.local_date} at ${data.local_time} (Brussels time) has been confirmed!\n\nPlease use the following link to join the meeting at the scheduled time:\n${data.meeting_url}\n\nLooking forward to meeting you,\nSempra`
    : `Bonjour ${data.names},\n\nVotre rendez-vous visio du ${data.local_date} à ${data.local_time} (Heure de Bruxelles) est confirmé !\n\nVeuillez utiliser le lien ci-dessous pour rejoindre la réunion à l'heure prévue :\n${data.meeting_url}\n\nÀ très vite,\nSempra`;

  try {
    await mailer.sendMail({
      from: fromAddress,
      to: data.email,
      subject: data.language === 'en' ? "Your Sempra video appointment is confirmed" : "Votre rendez-vous visio Sempra est confirmé",
      text: textClient,
    });
  } catch (error) {
    console.error("BOOKING_SMTP_FAILURE_CONFIRM");
    throw error;
  }
}

export async function sendBookingStatusEmail(data: Booking, status: 'rejected' | 'cancelled') {
  const mailer = getTransporter();
  const fromAddress = ENV.SMTP_FROM;

  const isCancel = status === 'cancelled';
  let textClient: string;
  let subject: string;
  const noteText = data.admin_note ? `\n\nNote de Sempra : ${data.admin_note}` : "";

  if (data.language === 'en') {
    subject = isCancel ? "Your Sempra video appointment has been cancelled" : "Update regarding your Sempra video appointment request";
    textClient = isCancel
      ? `Hello ${data.names},\n\nWe regret to inform you that your video appointment scheduled for ${data.local_date} at ${data.local_time} (Brussels time) has been cancelled.\n${noteText}\nWe apologize for the inconvenience.\n\nSempra`
      : `Hello ${data.names},\n\nUnfortunately, we are unable to accept your video appointment request for ${data.local_date} at ${data.local_time} (Brussels time).\n${noteText}\nWe apologize for the inconvenience.\n\nSempra`;
  } else {
    subject = isCancel ? "Votre rendez-vous visio Sempra a été annulé" : "Mise à jour de votre demande de rendez-vous visio Sempra";
    textClient = isCancel
      ? `Bonjour ${data.names},\n\nNous avons le regret de vous informer que votre rendez-vous visio prévu le ${data.local_date} à ${data.local_time} (Heure de Bruxelles) a été annulé.\n${noteText}\nNous nous excusons pour ce désagrément.\n\nSempra`
      : `Bonjour ${data.names},\n\nMalheureusement, nous ne pouvons pas accepter votre demande de rendez-vous visio pour le ${data.local_date} à ${data.local_time} (Heure de Bruxelles).\n${noteText}\nNous nous excusons pour ce désagrément.\n\nSempra`;
  }

  try {
    await mailer.sendMail({
      from: fromAddress,
      to: data.email,
      subject,
      text: textClient,
    });
  } catch (error) {
    console.error(`BOOKING_SMTP_FAILURE_STATUS`);
    throw error;
  }
}
