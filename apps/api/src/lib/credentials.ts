import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET_PREFIX = "sigilnode_";
const SECRET_ID_LENGTH = 16;

export function generateSecretId(): string {
  return randomBytes(SECRET_ID_LENGTH).toString("base64url").slice(0, SECRET_ID_LENGTH);
}

export function generateNodeSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function computeSignature(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}${body}`).digest("hex");
}

export function verifySignature(
  secret: string,
  signature: string,
  timestamp: number,
  body: string,
): boolean {
  const expected = computeSignature(secret, timestamp, body);
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function isTimestampValid(timestamp: number, windowSeconds = 60): boolean {
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - timestamp) <= windowSeconds;
}
