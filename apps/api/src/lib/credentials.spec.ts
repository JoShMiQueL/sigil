import { describe, expect, it } from "vitest";
import {
  computeSignature,
  generateNodeSecret,
  generateSecretId,
  isTimestampValid,
  verifySignature,
} from "./credentials";

describe("credentials", () => {
  describe("generateSecretId", () => {
    it("generates a 16-char base64url string", () => {
      const id = generateSecretId();
      expect(id).toHaveLength(16);
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("generates unique IDs", () => {
      const a = generateSecretId();
      const b = generateSecretId();
      expect(a).not.toBe(b);
    });
  });

  describe("generateNodeSecret", () => {
    it("generates a secret with the sigilnode_ prefix", () => {
      const secret = generateNodeSecret();
      expect(secret).toMatch(/^sigilnode_[A-Za-z0-9_-]+$/);
    });

    it("generates unique secrets", () => {
      const a = generateNodeSecret();
      const b = generateNodeSecret();
      expect(a).not.toBe(b);
    });
  });

  describe("computeSignature / verifySignature", () => {
    it("verifies a valid signature", () => {
      const secret = "test-secret";
      const timestamp = 1000000;
      const body = '{"cpu":42}';
      const signature = computeSignature(secret, timestamp, body);
      expect(verifySignature(secret, signature, timestamp, body)).toBe(true);
    });

    it("rejects a signature with wrong secret", () => {
      const secret = "test-secret";
      const wrongSecret = "wrong-secret";
      const timestamp = 1000000;
      const body = '{"cpu":42}';
      const signature = computeSignature(secret, timestamp, body);
      expect(verifySignature(wrongSecret, signature, timestamp, body)).toBe(false);
    });

    it("rejects a signature with wrong body", () => {
      const secret = "test-secret";
      const timestamp = 1000000;
      const signature = computeSignature(secret, timestamp, '{"cpu":42}');
      expect(verifySignature(secret, signature, timestamp, '{"cpu":99}')).toBe(false);
    });

    it("rejects a signature with wrong timestamp", () => {
      const secret = "test-secret";
      const timestamp = 1000000;
      const body = '{"cpu":42}';
      const signature = computeSignature(secret, timestamp, body);
      expect(verifySignature(secret, signature, 2000000, body)).toBe(false);
    });

    it("rejects signatures of different length", () => {
      expect(verifySignature("secret", "short", 1000, "body")).toBe(false);
    });
  });

  describe("isTimestampValid", () => {
    it("accepts current timestamp", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(isTimestampValid(now)).toBe(true);
    });

    it("accepts timestamp within 60s window", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(isTimestampValid(now - 30)).toBe(true);
      expect(isTimestampValid(now + 30)).toBe(true);
    });

    it("rejects timestamp outside 60s window", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(isTimestampValid(now - 120)).toBe(false);
      expect(isTimestampValid(now + 120)).toBe(false);
    });
  });
});
