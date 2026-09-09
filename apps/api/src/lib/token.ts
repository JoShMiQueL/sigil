import { createHash, randomBytes } from "node:crypto";

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function generateApiKey(): string {
  return `sigil_${generateToken(32)}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
