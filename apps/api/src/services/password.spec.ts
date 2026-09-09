import { describe, expect, it } from "vitest";
import { generateToken, hashToken, verifyToken } from "../lib/token";

describe("password reset token generation and hashing", () => {
  it("generates a 32-byte base64url token", () => {
    const token = generateToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it("hashes the token with SHA-256 (64 hex chars)", () => {
    const token = generateToken(32);
    const hash = hashToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("can verify a generated token against its hash", () => {
    const token = generateToken(32);
    const hash = hashToken(token);
    expect(verifyToken(token, hash)).toBe(true);
  });

  it("rejects a different token against the hash", () => {
    const token = generateToken(32);
    const wrongToken = generateToken(32);
    const hash = hashToken(token);
    expect(verifyToken(wrongToken, hash)).toBe(false);
  });

  it("produces unique tokens (no collisions)", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateToken(32));
    }
    expect(tokens.size).toBe(100);
  });

  it("hashing is deterministic (same token → same hash)", () => {
    const token = "reset-token-example";
    expect(hashToken(token)).toBe(hashToken(token));
  });
});
