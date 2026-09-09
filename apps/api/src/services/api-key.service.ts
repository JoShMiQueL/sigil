import { db, schema } from "@sigilpanel/db";
import { and, eq } from "drizzle-orm";
import { generateApiKey, hashToken } from "../lib/token";

export async function createApiKey(
  userId: string,
  name: string,
  scopes: string[],
): Promise<{ key: string; id: string; name: string; prefix: string; scopes: string[] }> {
  const rawKey = generateApiKey();
  const keyHash = hashToken(rawKey);
  const prefix = rawKey.slice(0, 12);

  const [row] = await db
    .insert(schema.apiKeys)
    .values({
      userId,
      name,
      keyHash,
      keyPrefix: prefix,
      scopes,
    })
    .returning();

  return {
    key: rawKey,
    id: row.id,
    name: row.name,
    prefix: row.keyPrefix,
    scopes: row.scopes,
  };
}

export async function listApiKeys(userId: string) {
  const rows = await db
    .select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      keyPrefix: schema.apiKeys.keyPrefix,
      scopes: schema.apiKeys.scopes,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.userId, userId))
    .orderBy(schema.apiKeys.createdAt);

  return rows.map((row) => ({
    ...row,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function verifyApiKey(
  rawKey: string,
): Promise<{ userId: string; scopes: string[]; keyId: string } | null> {
  const keyHash = hashToken(rawKey);

  const [row] = await db
    .select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.keyHash, keyHash))
    .limit(1);

  if (!row) return null;

  // Update last used
  await db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, row.id));

  return { userId: row.userId, scopes: row.scopes, keyId: row.id };
}

export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  const result = await db
    .delete(schema.apiKeys)
    .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.userId, userId)))
    .returning();

  return result.length > 0;
}
