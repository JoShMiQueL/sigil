import { describe, expect, it } from "vitest";
import { generateApiKey, generateToken, hashToken } from "./token";

describe("token", () => {
  it("generates a base64url token of expected length", () => {
    const token = generateToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it("generates unique tokens", () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
  });

  it("generates API keys with sigil_ prefix", () => {
    const key = generateApiKey();
    expect(key.startsWith("sigil_")).toBe(true);
  });

  it("hashes tokens deterministically with SHA-256", () => {
    const token = "test-token-123";
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("produces different hashes for different tokens", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });
});
