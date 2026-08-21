import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendContactEmail } from "../app/lib/mailer.server";
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
  let sendMailMock: import("vitest").Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    sendMailMock = vi.fn().mockResolvedValue({ accepted: ["to@example.com"] });
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
});
