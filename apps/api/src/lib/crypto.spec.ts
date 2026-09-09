import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";

describe("crypto (AES-256-GCM)", () => {
  it("encrypts and decrypts back to the original plaintext", () => {
    const plaintext = "JBSWY3DPEHPK3PXP";
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const a = encrypt("same-secret");
    const b = encrypt("same-secret");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("same-secret");
    expect(decrypt(b)).toBe("same-secret");
  });

  it("ciphertext format contains iv:tag:data separated by colons", () => {
    const ciphertext = encrypt("test");
    const parts = ciphertext.split(":");
    expect(parts).toHaveLength(3);
  });

  it("throws on invalid ciphertext format", () => {
    expect(() => decrypt("not-a-valid-format")).toThrow();
    expect(() => decrypt("only:two-parts")).toThrow();
  });

  it("throws on tampered ciphertext (auth tag mismatch)", () => {
    const ciphertext = encrypt("secret-data");
    const [iv, tag, data] = ciphertext.split(":");
    // Flip a bit in the data portion
    const tamperedData = data.slice(0, -2) + (data.slice(-2) === "AA" ? "BB" : "AA");
    const tampered = `${iv}:${tag}:${tamperedData}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it("handles unicode plaintext", () => {
    const plaintext = "héllo 世界 🎉";
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });
});
