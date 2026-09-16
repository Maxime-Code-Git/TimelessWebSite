import { describe, it, expect } from "vitest";
import { parseRangeHeader, parseWidth, parseFormat } from "../app/lib/media-utils";

describe("media-utils", () => {
  describe("parseRangeHeader", () => {
    const size = 1000;

    it("parses valid ranges", () => {
      expect(parseRangeHeader("bytes=0-499", size)).toEqual({ start: 0, end: 499 });
      expect(parseRangeHeader("bytes=500-", size)).toEqual({ start: 500, end: 999 });
      expect(parseRangeHeader("bytes=-500", size)).toEqual({ start: 500, end: 999 });
    });

    it("returns null for empty range", () => {
      expect(parseRangeHeader(null, size)).toBeNull();
      expect(parseRangeHeader("", size)).toBeNull();
    });

    it("throws on invalid unit", () => {
      expect(() => parseRangeHeader("bits=0-499", size)).toThrow("Invalid range unit");
    });

    it("throws on multiple ranges", () => {
      expect(() => parseRangeHeader("bytes=0-499, 500-999", size)).toThrow("Multiple ranges not supported");
    });

    it("throws on partial numbers", () => {
      expect(() => parseRangeHeader("bytes=0abc-499", size)).toThrow("Invalid range format");
      expect(() => parseRangeHeader("bytes=0-499abc", size)).toThrow("Invalid range format");
      expect(() => parseRangeHeader("bytes=-500abc", size)).toThrow("Invalid range format");
    });

    it("throws on invalid bounds", () => {
      expect(() => parseRangeHeader("bytes=500-499", size)).toThrow("Invalid range values");
      expect(() => parseRangeHeader("bytes=1000-1500", size)).toThrow("Invalid range values");
      expect(() => parseRangeHeader("bytes=-0", size)).toThrow("Invalid range values");
    });
  });

  describe("parseWidth", () => {
    it("parses valid widths", () => {
      expect(parseWidth("960")).toBe(960);
      expect(parseWidth("1920")).toBe(1920);
    });

    it("returns null for empty", () => {
      expect(parseWidth(null)).toBeNull();
    });

    it("throws on invalid numbers", () => {
      expect(() => parseWidth("960abc")).toThrow("Invalid width format");
    });

    it("throws on unsupported widths", () => {
      expect(() => parseWidth("800")).toThrow("Unsupported width");
    });
  });

  describe("parseFormat", () => {
    it("parses valid formats", () => {
      expect(parseFormat("jpeg")).toBe("jpeg");
    });

    it("returns null for empty", () => {
      expect(parseFormat(null)).toBeNull();
    });

    it("throws on invalid formats", () => {
      expect(() => parseFormat("gif")).toThrow("Unsupported format");
    });
  });
});
