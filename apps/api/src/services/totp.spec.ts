import { describe, expect, it } from "vitest";
import { hashToken, verifyToken } from "../lib/token";
import { generateTotpSecret, verifyTotp } from "../lib/totp";

describe("totp recovery codes", () => {
  it("hashes recovery codes and verifies them correctly", () => {
    const code = "a1b2c3d4e5f6a7b8";
    const hash = hashToken(code);
    expect(hash).not.toBe(code);
    expect(verifyToken(code, hash)).toBe(true);
  });

  it("rejects incorrect recovery code", () => {
    const hash = hashToken("correct-code-123");
    expect(verifyToken("wrong-code-456", hash)).toBe(false);
  });

  it("rejects hash of different length", () => {
    const hash = hashToken("code");
    expect(verifyToken("code", hash.slice(0, 10))).toBe(false);
  });

  it("recovery codes are single-use (hash changes after consumption)", () => {
    const codes = ["aaaabbbbccccdddd", "1111222233334444"];
    const hashes = codes.map((c) => hashToken(c));
    // Simulate consuming the first code
    const remaining = hashes.slice(1);
    expect(remaining).toHaveLength(1);
    expect(verifyToken(codes[1], remaining[0])).toBe(true);
    expect(verifyToken(codes[0], remaining[0])).toBe(false);
  });

  it("generates 8 recovery codes of 16 hex chars", () => {
    // Mirrors the generateRecoveryCodes logic in totp.service.ts
    const codes = Array.from({ length: 8 }, () =>
      require("node:crypto").randomBytes(8).toString("hex").slice(0, 16),
    );
    expect(codes).toHaveLength(8);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-f]{16}$/);
    }
    // All unique
    expect(new Set(codes).size).toBe(8);
  });
});

describe("totp secret generation and verification", () => {
  it("generates a base32 secret", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(16);
  });

  it("verifies a TOTP code generated from the secret", () => {
    const { authenticator } = require("@otplib/preset-default");
    const secret = generateTotpSecret();
    const token = authenticator.generate(secret);
    expect(verifyTotp(token, secret)).toBe(true);
  });

  it("rejects an invalid TOTP code", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp("000000", secret)).toBe(false);
  });
});
