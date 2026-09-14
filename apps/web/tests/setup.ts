import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import os from "node:os";
import path from "node:path";

process.env.SMTP_HOST = "localhost";
process.env.SMTP_PORT = "2525";
process.env.SMTP_USER = "user";
process.env.SMTP_PASS = "pass";
process.env.SMTP_FROM = "from@example.com";
process.env.SMTP_TO = "to@example.com";
process.env.CONTACT_RATE_LIMIT_SECRET = "secret";
process.env.RATE_LIMIT_DB_PATH = path.join(os.tmpdir(), "rate.db");
process.env.PUBLIC_SITE_URL = "http://localhost";
process.env.PORTFOLIO_CONTENT_PATH = path.join(os.tmpdir(), "port.json");
process.env.PORTFOLIO_MEDIA_PATH = path.join(os.tmpdir(), "port-media");
process.env.BOOKING_DB_PATH = path.join(os.tmpdir(), "book.db");
process.env.GALLERY_SECRET = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
process.env.GALLERY_DB_PATH = path.join(os.tmpdir(), "gallery.db");
process.env.GALLERY_MEDIA_PATH = path.join(os.tmpdir(), "gallery-media");
process.env.GALLERY_IMPORT_PATH = path.join(os.tmpdir(), "gallery-import");

afterEach(() => {
  cleanup();
});
