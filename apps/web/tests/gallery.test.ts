import { describe, expect, test } from "vitest";
import { hashGalleryCode, generateGalleryCode, encryptGalleryCode, decryptGalleryCode, isMediaAuthorized, getAuthorizedGalleryCoverId } from "../app/lib/gallery-auth.server";
import { vi } from "vitest";

const mockGet = vi.fn();
vi.mock("../app/lib/gallery-db.server", () => ({
  getGalleryDb: () => ({
    prepare: vi.fn(() => ({
      get: mockGet
    }))
  })
}));

describe("hashGalleryCode", () => {
  test("generates consistent hashes", () => {
    const hash1 = hashGalleryCode("ABC-123");
    const hash2 = hashGalleryCode("ABC-123");
    expect(hash1).toBe(hash2);
  });

  test("normalizes dashes and cases for HMAC (strips dashes, uppercases)", () => {
    const hash1 = hashGalleryCode("ABC-123");
    const hash2 = hashGalleryCode("abc123");
    expect(hash1).toBe(hash2);
  });

  test("normalizes spaces for HMAC", () => {
    const hash1 = hashGalleryCode("SEMPRA ABCD EFGH");
    const hash2 = hashGalleryCode("SEMPRAABCDEFGH");
    expect(hash1).toBe(hash2);
  });

  test("SEMPRA-XXXX-YYYY matches SEMPRAXXYY without dashes", () => {
    const hash1 = hashGalleryCode("SEMPRA-ABCD-EFGH");
    const hash2 = hashGalleryCode("sempraabcdefgh");
    expect(hash1).toBe(hash2);
  });

  test("returns 64 char hex string (SHA-256 HMAC)", () => {
    const hash = hashGalleryCode("TEST");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("generateGalleryCode", () => {
  test("creates codes in SEMPRA-XXXX-XXXX format", () => {
    const code = generateGalleryCode();
    expect(code).toMatch(/^SEMPRA-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  test("excludes ambiguous characters I, O, 0, 1", () => {
    // Generate many codes and check none contain ambiguous chars in the random part
    for (let i = 0; i < 50; i++) {
      const code = generateGalleryCode();
      const randomPart = code.replace("SEMPRA-", "").replace("-", "");
      expect(randomPart).not.toMatch(/[IO01]/);
    }
  });

  test("generates unique codes", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateGalleryCode());
    }
    expect(codes.size).toBe(100);
  });
});

describe("encryptGalleryCode / decryptGalleryCode", () => {
  test("round-trips preserve the original code with dashes", () => {
    const original = "SEMPRA-ABCD-EFGH";
    const encrypted = encryptGalleryCode(original);
    const decrypted = decryptGalleryCode(encrypted);
    expect(decrypted).toBe(original);
  });

  test("encrypted format is iv:ciphertext:authtag", () => {
    const encrypted = encryptGalleryCode("TEST-CODE");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    // IV is 12 bytes = 24 hex chars
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/);
    // Auth tag is 16 bytes = 32 hex chars
    expect(parts[2]).toMatch(/^[0-9a-f]{32}$/);
  });

  test("different encryptions produce different ciphertexts (random IV)", () => {
    const code = "SEMPRA-SAME-CODE";
    const enc1 = encryptGalleryCode(code);
    const enc2 = encryptGalleryCode(code);
    expect(enc1).not.toBe(enc2);
    // But both decrypt to the same value
    expect(decryptGalleryCode(enc1)).toBe(code);
    expect(decryptGalleryCode(enc2)).toBe(code);
  });

  test("rejects tampered ciphertext", () => {
    const encrypted = encryptGalleryCode("SEMPRA-TEST-ABCD");
    const parts = encrypted.split(":");
    // Tamper with ciphertext
    const tampered = parts[0] + ":" + "ff".repeat(parts[1].length / 2) + ":" + parts[2];
    expect(() => decryptGalleryCode(tampered)).toThrow();
  });

  test("rejects invalid format", () => {
    expect(() => decryptGalleryCode("invalid")).toThrow("Invalid encrypted format");
    expect(() => decryptGalleryCode("a:b")).toThrow("Invalid encrypted format");
    expect(() => decryptGalleryCode("a:b:c:d")).toThrow("Invalid encrypted format");
  });
});

describe("isMediaAuthorized", () => {
  test('isMediaAuthorized("invites", "invites") is allowed', () => {
    expect(isMediaAuthorized("invites", "invites")).toBe(true);
  });

  test('isMediaAuthorized("maries", "invites") is denied', () => {
    expect(isMediaAuthorized("maries", "invites")).toBe(false);
  });

  test('isMediaAuthorized("invites", "maries") is allowed', () => {
    expect(isMediaAuthorized("invites", "maries")).toBe(true);
  });

  test('isMediaAuthorized("maries", "maries") is allowed', () => {
    expect(isMediaAuthorized("maries", "maries")).toBe(true);
  });

  test("unknown visibility or access level is denied by default", () => {
    expect(isMediaAuthorized("unknown", "invites")).toBe(false);
    expect(isMediaAuthorized("unknown", "maries")).toBe(false);
    expect(isMediaAuthorized("invites", "unknown" as "invites")).toBe(false);
    expect(isMediaAuthorized(null, "invites")).toBe(false);
    expect(isMediaAuthorized(undefined, "maries")).toBe(false);
  });
});

describe("getAuthorizedGalleryCoverId", () => {
  const galleryId = "gallery-123";

  test("returns null if coverImageId is null", () => {
    expect(getAuthorizedGalleryCoverId(galleryId, null, "invites")).toBeNull();
  });

  test("returns coverImageId if authorized", () => {
    mockGet.mockReturnValueOnce({ visibility: "invites", type: "photo" });
    expect(getAuthorizedGalleryCoverId(galleryId, "photo-1", "invites")).toBe("photo-1");
  });

  test("returns null if media type is not photo", () => {
    mockGet.mockReturnValueOnce({ visibility: "invites", type: "video" });
    expect(getAuthorizedGalleryCoverId(galleryId, "video-1", "invites")).toBeNull();
  });

  test("returns null if visibility is not authorized for access level", () => {
    mockGet.mockReturnValueOnce({ visibility: "maries", type: "photo" });
    expect(getAuthorizedGalleryCoverId(galleryId, "photo-2", "invites")).toBeNull();
  });

  test("returns null if media belongs to another gallery (get returns undefined)", () => {
    mockGet.mockReturnValueOnce(undefined);
    expect(getAuthorizedGalleryCoverId(galleryId, "photo-3", "invites")).toBeNull();
  });

  test("passes unknown access level correctly to isMediaAuthorized", () => {
    mockGet.mockReturnValueOnce({ visibility: "invites", type: "photo" });
    expect(getAuthorizedGalleryCoverId(galleryId, "photo-4", "corrupted_level")).toBeNull();
  });
});
