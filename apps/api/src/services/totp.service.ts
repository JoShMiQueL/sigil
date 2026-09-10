import { randomBytes } from "node:crypto";
import { db, schema } from "@sigil/db";
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "../lib/crypto";
import { hashToken, verifyToken } from "../lib/token";
import { generateTotpSecret, generateTotpUri, verifyTotp } from "../lib/totp";

const RECOVERY_CODE_COUNT = 8;

function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    randomBytes(8).toString("hex").slice(0, 16),
  );
}

export async function enableTotp(
  userId: string,
): Promise<{ secret: string; qrUri: string; recoveryCodes: string[] }> {
  const secret = generateTotpSecret();
  const encryptedSecret = encrypt(secret);
  const recoveryCodes = generateRecoveryCodes();
  const hashedRecoveryCodes = recoveryCodes.map((code) => hashToken(code));

  // Store encrypted secret and hashed recovery codes (not yet activated)
  await db
    .update(schema.users)
    .set({
      totpSecret: encryptedSecret,
      recoveryCodes: hashedRecoveryCodes,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));

  const user = await getUserEmail(userId);
  const qrUri = generateTotpUri(user, secret);

  return { secret, qrUri, recoveryCodes };
}

async function getUserEmail(userId: string): Promise<string> {
  const [row] = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row?.email ?? "user@sigil.local";
}

export async function verifyAndActivateTotp(
  userId: string,
  code: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

  if (!user?.totpSecret) {
    return { success: false, error: "2FA not initiated" };
  }

  const secret = decrypt(user.totpSecret);
  if (!verifyTotp(code, secret)) {
    return { success: false, error: "Invalid TOTP code" };
  }

  await db
    .update(schema.users)
    .set({ totpEnabled: true, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));

  return { success: true };
}

export async function disableTotp(
  userId: string,
  password: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

  if (!user) {
    return { success: false, error: "User not found" };
  }

  // Verify password
  const { verifyPassword } = await import("../lib/argon2");
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    return { success: false, error: "Invalid password" };
  }

  await db
    .update(schema.users)
    .set({
      totpEnabled: false,
      totpSecret: null,
      recoveryCodes: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));

  return { success: true };
}

export async function verifyTotpForLogin(userId: string, code: string): Promise<boolean> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

  if (!user?.totpSecret || !user.totpEnabled) {
    return false;
  }

  const secret = decrypt(user.totpSecret);
  return verifyTotp(code, secret);
}

export async function verifyRecoveryCodeForLogin(userId: string, code: string): Promise<boolean> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

  if (!user?.recoveryCodes || !user.totpEnabled) {
    return false;
  }

  for (let i = 0; i < user.recoveryCodes.length; i++) {
    if (verifyToken(code, user.recoveryCodes[i])) {
      // Consume this recovery code (remove from array)
      const remaining = user.recoveryCodes.filter((_, idx) => idx !== i);
      await db
        .update(schema.users)
        .set({ recoveryCodes: remaining, updatedAt: new Date() })
        .where(eq(schema.users.id, userId));
      return true;
    }
  }

  return false;
}
