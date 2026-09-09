import { db, schema } from "@sigilpanel/db";
import { and, eq, isNull, lt } from "drizzle-orm";
import { hashPassword } from "../lib/argon2";
import { generateToken, hashToken } from "../lib/token";

const TOKEN_EXPIRY_HOURS = 1;

export async function createResetToken(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  // Invalidate all existing unused tokens for this user
  await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(eq(schema.passwordResetTokens.userId, userId), isNull(schema.passwordResetTokens.usedAt)),
    );

  const token = generateToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await db.insert(schema.passwordResetTokens).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function verifyResetToken(
  token: string,
): Promise<{ userId: string; tokenId: string } | null> {
  const tokenHash = hashToken(token);

  const [row] = await db
    .select()
    .from(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  if (row.usedAt !== null) return null;
  if (row.expiresAt < new Date()) return null;

  return { userId: row.userId, tokenId: row.id };
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const verification = await verifyResetToken(token);
  if (!verification) {
    return { success: false, error: "Invalid or expired token" };
  }

  const passwordHash = await hashPassword(newPassword);

  // Update password
  await db
    .update(schema.users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(schema.users.id, verification.userId));

  // Mark token as used
  await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(schema.passwordResetTokens.id, verification.tokenId));

  // Revoke all sessions for this user
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, verification.userId));

  return { success: true };
}

// Cleanup expired tokens (can be called periodically)
export async function cleanupExpiredTokens(): Promise<void> {
  await db
    .delete(schema.passwordResetTokens)
    .where(lt(schema.passwordResetTokens.expiresAt, new Date()));
}
