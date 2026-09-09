import { db, schema } from "@sigilpanel/db";
import type { Node } from "@sigilpanel/shared";
import { eq } from "drizzle-orm";

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
