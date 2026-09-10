import { db, schema } from "@sigil/db";
import type { Region, RegionCreate, RegionWithCounts } from "@sigil/shared";
import { count, eq } from "drizzle-orm";
import { emit } from "./sse.service";

function toRegion(row: typeof schema.regions.$inferSelect): Region {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createRegion(input: RegionCreate): Promise<Region> {
  const [row] = await db
    .insert(schema.regions)
    .values({
      name: input.name,
      description: input.description ?? null,
    })
    .returning();

  const region = toRegion(row);
  emit("region.update", region);
  return region;
}

export async function listRegions(): Promise<RegionWithCounts[]> {
  const rows = await db
    .select({
      id: schema.regions.id,
      name: schema.regions.name,
      description: schema.regions.description,
      createdAt: schema.regions.createdAt,
      updatedAt: schema.regions.updatedAt,
      nodeCount: count(schema.nodes.id),
    })
    .from(schema.regions)
    .leftJoin(schema.nodes, eq(schema.nodes.regionId, schema.regions.id))
    .groupBy(schema.regions.id)
    .orderBy(schema.regions.createdAt);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    nodeCount: row.nodeCount,
    serverCount: 0,
  }));
}

export async function getRegionById(id: string): Promise<Region | null> {
  const [row] = await db.select().from(schema.regions).where(eq(schema.regions.id, id)).limit(1);
  return row ? toRegion(row) : null;
}

export async function deleteRegion(id: string): Promise<{ ok: true } | { error: string }> {
  const [nodeCount] = await db
    .select({ value: count() })
    .from(schema.nodes)
    .where(eq(schema.nodes.regionId, id));

  if ((nodeCount?.value ?? 0) > 0) {
    return { error: "Cannot delete a region with active nodes" };
  }

  await db.delete(schema.regions).where(eq(schema.regions.id, id));
  emit("region.update", { id });
  return { ok: true };
}
