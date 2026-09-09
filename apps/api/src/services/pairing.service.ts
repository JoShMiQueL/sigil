import { db, schema } from "@sigilpanel/db";
import { eq } from "drizzle-orm";
import { generateNodeSecret, generateSecretId } from "../lib/credentials";
import { encrypt } from "../lib/crypto";
import { hashToken } from "../lib/token";

const PAIRING_TOKEN_PREFIX = "sigilpair_";
const PAIRING_TOKEN_TTL_MIN = 15;

export async function generatePairingToken(
  regionId: string,
  createdBy: string,
): Promise<{
  id: string;
  token: string;
  regionId: string;
  expiresAt: Date;
}> {
  const rawToken = `${PAIRING_TOKEN_PREFIX}${generateSecretId()}${generateSecretId()}`;
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MIN * 60 * 1000);

  const [row] = await db
    .insert(schema.pairingTokens)
    .values({
      tokenHash,
      regionId,
      createdBy,
      expiresAt,
    })
    .returning();

  return {
    id: row.id,
    token: rawToken,
    regionId: row.regionId,
    expiresAt: row.expiresAt,
  };
}

export async function listPairingTokens(): Promise<
  Array<{
    id: string;
    regionId: string;
    createdBy: string;
    expiresAt: string;
    usedAt: string | null;
    usedByNodeId: string | null;
    createdAt: string;
  }>
> {
  const rows = await db
    .select({
      id: schema.pairingTokens.id,
      regionId: schema.pairingTokens.regionId,
      createdBy: schema.pairingTokens.createdBy,
      expiresAt: schema.pairingTokens.expiresAt,
      usedAt: schema.pairingTokens.usedAt,
      usedByNodeId: schema.pairingTokens.usedByNodeId,
      createdAt: schema.pairingTokens.createdAt,
    })
    .from(schema.pairingTokens)
    .orderBy(schema.pairingTokens.createdAt);

  return rows.map((row) => ({
    id: row.id,
    regionId: row.regionId,
    createdBy: row.createdBy,
    expiresAt: row.expiresAt.toISOString(),
    usedAt: row.usedAt?.toISOString() ?? null,
    usedByNodeId: row.usedByNodeId ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function consumePairingToken(
  rawToken: string,
  daemonInfo: { hostname: string; ipAddress: string; capabilities: Record<string, unknown> },
): Promise<{ ok: true; nodeId: string; secretId: string; secret: string } | { error: string }> {
  const tokenHash = hashToken(rawToken);

  const [tokenRow] = await db
    .select()
    .from(schema.pairingTokens)
    .where(eq(schema.pairingTokens.tokenHash, tokenHash))
    .limit(1);

  if (!tokenRow) {
    return { error: "Pairing token invalid" };
  }

  if (tokenRow.usedAt !== null) {
    return { error: "Pairing token already used" };
  }

  if (tokenRow.expiresAt < new Date()) {
    return { error: "Pairing token expired" };
  }

  // Create the node
  const [nodeRow] = await db
    .insert(schema.nodes)
    .values({
      regionId: tokenRow.regionId,
      hostname: daemonInfo.hostname,
      ipAddress: daemonInfo.ipAddress,
      displayName: daemonInfo.hostname,
      capabilities: daemonInfo.capabilities,
      status: "unknown",
    })
    .returning();

  // Generate credentials
  const secretId = generateSecretId();
  const secret = generateNodeSecret();

  await db.insert(schema.nodeCredentials).values({
    nodeId: nodeRow.id,
    secretId,
    secretEncrypted: encrypt(secret),
  });

  // Mark token as used
  await db
    .update(schema.pairingTokens)
    .set({ usedAt: new Date(), usedByNodeId: nodeRow.id })
    .where(eq(schema.pairingTokens.id, tokenRow.id));

  return { ok: true, nodeId: nodeRow.id, secretId, secret };
}
