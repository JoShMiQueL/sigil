import { db, schema } from "@sigilpanel/db";
import type { Node, NodeUpdate } from "@sigilpanel/shared";
import { eq } from "drizzle-orm";
import { generateNodeSecret, generateSecretId } from "../lib/credentials";
import { encrypt } from "../lib/crypto";

function toNode(row: typeof schema.nodes.$inferSelect, regionName: string): Node {
  return {
    id: row.id,
    regionId: row.regionId,
    regionName,
    hostname: row.hostname,
    displayName: row.displayName,
    ipAddress: row.ipAddress,
    capabilities: row.capabilities as Record<string, unknown>,
    status: row.status as "online" | "offline" | "unknown",
    cpuUsage: row.cpuUsage,
    memoryUsage: row.memoryUsage,
    diskUsage: row.diskUsage,
    containerCount: row.containerCount,
    lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listNodes(regionId?: string): Promise<Node[]> {
  const rows = regionId
    ? await db
        .select({
          node: schema.nodes,
          regionName: schema.regions.name,
        })
        .from(schema.nodes)
        .innerJoin(schema.regions, eq(schema.nodes.regionId, schema.regions.id))
        .where(eq(schema.nodes.regionId, regionId))
        .orderBy(schema.nodes.createdAt)
    : await db
        .select({
          node: schema.nodes,
          regionName: schema.regions.name,
        })
        .from(schema.nodes)
        .innerJoin(schema.regions, eq(schema.nodes.regionId, schema.regions.id))
        .orderBy(schema.nodes.createdAt);

  return rows.map((row) => toNode(row.node, row.regionName));
}

export async function getNodeById(id: string): Promise<Node | null> {
  const [row] = await db
    .select({
      node: schema.nodes,
      regionName: schema.regions.name,
    })
    .from(schema.nodes)
    .innerJoin(schema.regions, eq(schema.nodes.regionId, schema.regions.id))
    .where(eq(schema.nodes.id, id))
    .limit(1);

  return row ? toNode(row.node, row.regionName) : null;
}

export async function updateNode(id: string, input: NodeUpdate): Promise<Node | null> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.displayName !== undefined) updates.displayName = input.displayName;
  if (input.regionId !== undefined) updates.regionId = input.regionId;

  const [row] = await db
    .update(schema.nodes)
    .set(updates)
    .where(eq(schema.nodes.id, id))
    .returning();

  if (!row) return null;

  const [region] = await db
    .select({ name: schema.regions.name })
    .from(schema.regions)
    .where(eq(schema.regions.id, row.regionId))
    .limit(1);

  return toNode(row, region?.name ?? "");
}

export async function deleteNode(id: string): Promise<{ ok: true } | { error: string }> {
  const [row] = await db.select().from(schema.nodes).where(eq(schema.nodes.id, id)).limit(1);
  if (!row) return { error: "Node not found" };

  await db.delete(schema.nodes).where(eq(schema.nodes.id, id));
  return { ok: true };
}

export async function regenerateCredentials(
  nodeId: string,
): Promise<{ secretId: string; secret: string } | { error: string }> {
  const [row] = await db.select().from(schema.nodes).where(eq(schema.nodes.id, nodeId)).limit(1);
  if (!row) return { error: "Node not found" };

  const secretId = generateSecretId();
  const secret = generateNodeSecret();

  await db.insert(schema.nodeCredentials).values({
    nodeId,
    secretId,
    secretEncrypted: encrypt(secret),
  });

  return { secretId, secret };
}

export async function revokeCredentials(nodeId: string): Promise<{ ok: true } | { error: string }> {
  const [row] = await db.select().from(schema.nodes).where(eq(schema.nodes.id, nodeId)).limit(1);
  if (!row) return { error: "Node not found" };

  await db
    .update(schema.nodeCredentials)
    .set({ revokedAt: new Date() })
    .where(eq(schema.nodeCredentials.nodeId, nodeId));

  return { ok: true };
}
