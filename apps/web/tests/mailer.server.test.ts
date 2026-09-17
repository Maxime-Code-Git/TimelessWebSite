import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendContactEmail, sendBookingConfirmedEmail } from "../app/lib/mailer.server";
import nodemailer from "nodemailer";

vi.mock("../app/lib/env.server", () => {
  return {
    ENV: {
      SMTP_HOST: "localhost",
      SMTP_PORT: 2525,
      SMTP_USER: "test",
      SMTP_PASS: "test",
      SMTP_FROM: "from@example.com",
      SMTP_TO: "to@example.com",
    }
  };
});

describe("Mailer Server", () => {
  const sendMailMock = vi.fn().mockResolvedValue({ accepted: ["to@example.com"] });

  beforeEach(() => {
    vi.clearAllMocks();
    sendMailMock.mockClear();
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail: sendMailMock
    } as unknown as nodemailer.Transporter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should send email with correct from, to and replyTo properties", async () => {
    const data = {
      names: "Visitor Name",
      email: "visitor@example.com",
      date: "2027-01-01",
      location: "Paris",
      formula: "photo",
      message: "Hello",
      phone: ""
    };

    await sendContactEmail(data);

    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
      from: "from@example.com",
      to: "to@example.com",
      replyTo: "visitor@example.com",
    }));

    const callArgs = sendMailMock.mock.calls[0][0];
    expect(callArgs.from).not.toContain(data.email);
    expect(callArgs.from).not.toContain(data.names);
  });

  describe("sendBookingConfirmedEmail", () => {
    it("should include admin note for FR emails", async () => {
      const data = {
        names: "Alice",
        email: "alice@example.com",
        local_date: "2027-01-01",
        local_time: "10:00",
        language: "fr",
        meeting_url: "https://meet.google.com/abc",
        admin_note: "Ceci est une note"
      };
      await sendBookingConfirmedEmail(data as unknown as import("../app/lib/booking.server").Booking);
      expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining("Note de Sempra : Ceci est une note")
      }));
    });

    it("should include admin note for EN emails", async () => {
      const data = {
        names: "Bob",
        email: "bob@example.com",
        local_date: "2027-01-01",
        local_time: "10:00",
        language: "en",
        meeting_url: "https://meet.google.com/abc",
        admin_note: "This is a note"
      };
      await sendBookingConfirmedEmail(data as unknown as import("../app/lib/booking.server").Booking);
      expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining("Note from Sempra: This is a note")
      }));
    });
  });
});
