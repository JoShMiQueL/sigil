import { db, schema } from "@sigil/db";
import type {
  Allocation,
  AllocationCreate,
  AllocationCreateResult,
  AllocationListResponse,
  AllocationReleaseResult,
  AllocationSummary,
} from "@sigil/shared";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { emit } from "./sse.service";

function toAllocation(row: typeof schema.allocations.$inferSelect): Allocation {
  return {
    id: row.id,
    nodeId: row.nodeId,
    ip: row.ip,
    port: row.port,
    protocol: row.protocol as "tcp" | "udp",
    status: row.status as "available" | "assigned",
    serverId: row.serverId,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildPortRange(portStart: number, portEnd?: number): string {
  return portEnd === undefined || portEnd === portStart
    ? `${portStart}`
    : `${portStart}-${portEnd}`;
}

export async function addAllocations(
  nodeId: string,
  input: AllocationCreate,
): Promise<AllocationCreateResult> {
  const portEnd = input.portEnd ?? input.portStart;
  const ports: number[] = [];
  for (let p = input.portStart; p <= portEnd; p++) ports.push(p);

  const rows = ports.map((port) => ({
    nodeId,
    ip: input.ip,
    port,
    protocol: input.protocol,
    status: "available" as const,
    isPrimary: false,
  }));

  // ON CONFLICT DO NOTHING for idempotent adds
  const inserted = await db
    .insert(schema.allocations)
    .values(rows)
    .onConflictDoNothing({
      target: [
        schema.allocations.nodeId,
        schema.allocations.ip,
        schema.allocations.port,
        schema.allocations.protocol,
      ],
    })
    .returning({ id: schema.allocations.id });

  const created = inserted.length;
  const skipped = ports.length - created;

  const portRange = buildPortRange(input.portStart, portEnd);
  emit("allocation.create", { nodeId, ip: input.ip, count: created, portRange });

  return { created, skipped, ip: input.ip, portRange };
}

export async function listAllocations(
  nodeId: string,
  filters: { status?: string; ip?: string; port?: number; limit?: number; offset?: number },
): Promise<AllocationListResponse> {
  const limit = Math.min(filters.limit ?? 100, 1000);
  const offset = filters.offset ?? 0;

  const conditions = [eq(schema.allocations.nodeId, nodeId)];
  if (filters.status === "available" || filters.status === "assigned") {
    conditions.push(eq(schema.allocations.status, filters.status));
  }
  if (filters.ip) {
    conditions.push(eq(schema.allocations.ip, filters.ip));
  }
  if (filters.port !== undefined) {
    conditions.push(eq(schema.allocations.port, filters.port));
  }

  const where = and(...conditions);

  const rows = await db
    .select()
    .from(schema.allocations)
    .where(where)
    .orderBy(schema.allocations.ip, schema.allocations.port)
    .limit(limit)
    .offset(offset);

  // Summary counts for this node (ignoring filters)
  const [totalRow] = await db
    .select({ value: count() })
    .from(schema.allocations)
    .where(eq(schema.allocations.nodeId, nodeId));
  const [availableRow] = await db
    .select({ value: count() })
    .from(schema.allocations)
    .where(and(eq(schema.allocations.nodeId, nodeId), eq(schema.allocations.status, "available")));
  const [assignedRow] = await db
    .select({ value: count() })
    .from(schema.allocations)
    .where(and(eq(schema.allocations.nodeId, nodeId), eq(schema.allocations.status, "assigned")));

  return {
    allocations: rows.map(toAllocation),
    total: totalRow?.value ?? 0,
    available: availableRow?.value ?? 0,
    assigned: assignedRow?.value ?? 0,
  };
}

export async function getAllocationSummary(nodeId: string): Promise<AllocationSummary> {
  const [totalRow] = await db
    .select({ value: count() })
    .from(schema.allocations)
    .where(eq(schema.allocations.nodeId, nodeId));
  const [availableRow] = await db
    .select({ value: count() })
    .from(schema.allocations)
    .where(and(eq(schema.allocations.nodeId, nodeId), eq(schema.allocations.status, "available")));
  const [assignedRow] = await db
    .select({ value: count() })
    .from(schema.allocations)
    .where(and(eq(schema.allocations.nodeId, nodeId), eq(schema.allocations.status, "assigned")));

  const [nodeRow] = await db
    .select({ primaryIp: schema.nodes.primaryIp })
    .from(schema.nodes)
    .where(eq(schema.nodes.id, nodeId))
    .limit(1);

  return {
    total: totalRow?.value ?? 0,
    available: availableRow?.value ?? 0,
    assigned: assignedRow?.value ?? 0,
    primaryIp: nodeRow?.primaryIp ?? null,
  };
}

export async function deleteAllocation(
  allocationId: string,
): Promise<{ ok: true } | { error: string; code: string }> {
  const [row] = await db
    .select()
    .from(schema.allocations)
    .where(eq(schema.allocations.id, allocationId))
    .limit(1);

  if (!row) return { error: "Allocation not found", code: "ALLOCATION_NOT_FOUND" };
  if (row.status === "assigned") {
    return {
      error: "Cannot delete an allocation that is assigned to a server",
      code: "ALLOCATION_ASSIGNED",
    };
  }

  await db.delete(schema.allocations).where(eq(schema.allocations.id, allocationId));
  emit("allocation.delete", { id: allocationId, nodeId: row.nodeId, deleted: true });
  return { ok: true };
}

export async function assignAllocation(
  allocationId: string,
  serverId: string,
  isPrimary: boolean,
): Promise<Allocation | { error: string; code: string }> {
  const [row] = await db
    .select()
    .from(schema.allocations)
    .where(eq(schema.allocations.id, allocationId))
    .limit(1);

  if (!row) return { error: "Allocation not found", code: "ALLOCATION_NOT_FOUND" };
  if (row.status === "assigned" && row.serverId !== serverId) {
    return {
      error: "Allocation is already assigned to another server",
      code: "ALLOCATION_ALREADY_ASSIGNED",
    };
  }

  // If setting as primary, clear any existing primary for this server
  if (isPrimary) {
    await db
      .update(schema.allocations)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(
        and(eq(schema.allocations.serverId, serverId), eq(schema.allocations.isPrimary, true)),
      );
  }

  const [updated] = await db
    .update(schema.allocations)
    .set({
      status: "assigned",
      serverId,
      isPrimary,
      updatedAt: new Date(),
    })
    .where(eq(schema.allocations.id, allocationId))
    .returning();

  const allocation = toAllocation(updated);
  emit("allocation.update", allocation);
  return allocation;
}

export async function unassignAllocation(
  allocationId: string,
): Promise<Allocation | { error: string; code: string }> {
  const [row] = await db
    .select()
    .from(schema.allocations)
    .where(eq(schema.allocations.id, allocationId))
    .limit(1);

  if (!row) return { error: "Allocation not found", code: "ALLOCATION_NOT_FOUND" };
  if (row.status !== "assigned") {
    return { error: "Allocation is not assigned", code: "ALLOCATION_NOT_ASSIGNED" };
  }

  const [updated] = await db
    .update(schema.allocations)
    .set({
      status: "available",
      serverId: null,
      isPrimary: false,
      updatedAt: new Date(),
    })
    .where(eq(schema.allocations.id, allocationId))
    .returning();

  const allocation = toAllocation(updated);
  emit("allocation.update", allocation);
  return allocation;
}

export async function autoAssignAllocation(
  nodeId: string,
  serverId: string,
): Promise<Allocation | { error: string; code: string }> {
  // Get the node's primary IP
  const [nodeRow] = await db
    .select({ primaryIp: schema.nodes.primaryIp })
    .from(schema.nodes)
    .where(eq(schema.nodes.id, nodeId))
    .limit(1);

  if (!nodeRow) return { error: "Node not found", code: "NODE_NOT_FOUND" };

  // Try to find an available allocation on the primary IP first, then any
  const baseConditions = [
    eq(schema.allocations.nodeId, nodeId),
    eq(schema.allocations.status, "available"),
  ];

  let row: typeof schema.allocations.$inferSelect | undefined;

  if (nodeRow.primaryIp) {
    [row] = await db
      .select()
      .from(schema.allocations)
      .where(and(...baseConditions, eq(schema.allocations.ip, nodeRow.primaryIp)))
      .orderBy(schema.allocations.port)
      .limit(1);
  }

  if (!row) {
    [row] = await db
      .select()
      .from(schema.allocations)
      .where(and(...baseConditions))
      .orderBy(schema.allocations.port)
      .limit(1);
  }

  if (!row) {
    return { error: "No available allocations on this node", code: "NO_AVAILABLE_ALLOCATIONS" };
  }

  // Clear any existing primary for this server
  await db
    .update(schema.allocations)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(and(eq(schema.allocations.serverId, serverId), eq(schema.allocations.isPrimary, true)));

  const [updated] = await db
    .update(schema.allocations)
    .set({
      status: "assigned",
      serverId,
      isPrimary: true,
      updatedAt: new Date(),
    })
    .where(eq(schema.allocations.id, row.id))
    .returning();

  const allocation = toAllocation(updated);
  emit("allocation.update", allocation);
  return allocation;
}

export async function releaseAllocations(serverId: string): Promise<AllocationReleaseResult> {
  const result = await db
    .update(schema.allocations)
    .set({
      status: "available",
      serverId: null,
      isPrimary: false,
      updatedAt: new Date(),
    })
    .where(eq(schema.allocations.serverId, serverId))
    .returning({ id: schema.allocations.id, nodeId: schema.allocations.nodeId });

  // Emit update events for each released allocation
  for (const r of result) {
    emit("allocation.update", {
      id: r.id,
      nodeId: r.nodeId,
      status: "available",
      serverId: null,
      isPrimary: false,
    });
  }

  return { released: result.length };
}

export async function countAssignedAllocationsOnNode(nodeId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(schema.allocations)
    .where(and(eq(schema.allocations.nodeId, nodeId), eq(schema.allocations.status, "assigned")));
  return row?.value ?? 0;
}
