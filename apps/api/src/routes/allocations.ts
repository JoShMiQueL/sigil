import { zValidator } from "@hono/zod-validator";
import {
  AllocationAssignSchema,
  AllocationAutoAssignSchema,
  AllocationCreateSchema,
  AllocationReleaseSchema,
} from "@sigil/shared";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import {
  addAllocations,
  assignAllocation,
  autoAssignAllocation,
  deleteAllocation,
  getAllocationSummary,
  listAllocations,
  releaseAllocations,
  unassignAllocation,
} from "../services/allocation.service";
import { logAudit } from "../services/audit.service";

const allocations = new Hono<AuthContext>();

// Admin-only guard
allocations.use("*", async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

// POST /:nodeId/allocations — add IP + port range
allocations.post("/:nodeId/allocations", zValidator("json", AllocationCreateSchema), async (c) => {
  const nodeId = c.req.param("nodeId");
  const input = c.req.valid("json");

  const result = await addAllocations(nodeId, input);

  const user = c.get("user");
  await logAudit({
    userId: user?.id,
    action: "allocation_create",
    targetType: "node",
    targetId: nodeId,
    metadata: { ip: input.ip, portRange: result.portRange, created: result.created },
  });

  return c.json(result, 201);
});

// GET /:nodeId/allocations — list with filters
allocations.get("/:nodeId/allocations", async (c) => {
  const nodeId = c.req.param("nodeId");
  const status = c.req.query("status");
  const ip = c.req.query("ip");
  const portParam = c.req.query("port");
  const limitParam = c.req.query("limit");
  const offsetParam = c.req.query("offset");

  const port = portParam !== undefined ? Number.parseInt(portParam, 10) : undefined;
  const limit = limitParam !== undefined ? Number.parseInt(limitParam, 10) : undefined;
  const offset = offsetParam !== undefined ? Number.parseInt(offsetParam, 10) : undefined;

  const result = await listAllocations(nodeId, { status, ip, port, limit, offset });
  return c.json(result);
});

// GET /:nodeId/allocations/summary — counts + primary IP
allocations.get("/:nodeId/allocations/summary", async (c) => {
  const nodeId = c.req.param("nodeId");
  const summary = await getAllocationSummary(nodeId);
  return c.json(summary);
});

// DELETE /:nodeId/allocations/:allocationId — delete (reject if assigned)
allocations.delete("/:nodeId/allocations/:allocationId", async (c) => {
  const allocationId = c.req.param("allocationId");
  const result = await deleteAllocation(allocationId);

  if ("error" in result) {
    const status = result.code === "ALLOCATION_ASSIGNED" ? 409 : 404;
    return c.json({ error: { code: result.code, message: result.error } }, status);
  }

  const user = c.get("user");
  await logAudit({
    userId: user?.id,
    action: "allocation_delete",
    targetType: "allocation",
    targetId: allocationId,
  });

  return c.body(null, 204);
});

// POST /:nodeId/allocations/:allocationId/assign — assign to server
allocations.post(
  "/:nodeId/allocations/:allocationId/assign",
  zValidator("json", AllocationAssignSchema),
  async (c) => {
    const allocationId = c.req.param("allocationId");
    const input = c.req.valid("json");

    const result = await assignAllocation(allocationId, input.serverId, input.isPrimary);

    if ("error" in result) {
      const status = result.code === "ALLOCATION_ALREADY_ASSIGNED" ? 409 : 404;
      return c.json({ error: { code: result.code, message: result.error } }, status);
    }

    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: "allocation_assign",
      targetType: "allocation",
      targetId: allocationId,
      metadata: { serverId: input.serverId, isPrimary: input.isPrimary },
    });

    return c.json(result, 200);
  },
);

// POST /:nodeId/allocations/:allocationId/unassign — unassign
allocations.post("/:nodeId/allocations/:allocationId/unassign", async (c) => {
  const allocationId = c.req.param("allocationId");
  const result = await unassignAllocation(allocationId);

  if ("error" in result) {
    const status = result.code === "ALLOCATION_NOT_ASSIGNED" ? 409 : 404;
    return c.json({ error: { code: result.code, message: result.error } }, status);
  }

  const user = c.get("user");
  await logAudit({
    userId: user?.id,
    action: "allocation_unassign",
    targetType: "allocation",
    targetId: allocationId,
  });

  return c.json(result, 200);
});

// POST /:nodeId/allocations/auto-assign — auto-assign primary
allocations.post(
  "/:nodeId/allocations/auto-assign",
  zValidator("json", AllocationAutoAssignSchema),
  async (c) => {
    const nodeId = c.req.param("nodeId");
    const input = c.req.valid("json");

    const result = await autoAssignAllocation(nodeId, input.serverId);

    if ("error" in result) {
      const status = result.code === "NO_AVAILABLE_ALLOCATIONS" ? 409 : 404;
      return c.json({ error: { code: result.code, message: result.error } }, status);
    }

    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: "allocation_auto_assign",
      targetType: "node",
      targetId: nodeId,
      metadata: { serverId: input.serverId, allocationId: result.id },
    });

    return c.json({ allocation: result }, 200);
  },
);

// POST /allocations/release — release all for a server (for R9 integration)
allocations.post("/allocations/release", zValidator("json", AllocationReleaseSchema), async (c) => {
  const input = c.req.valid("json");
  const result = await releaseAllocations(input.serverId);

  const user = c.get("user");
  await logAudit({
    userId: user?.id,
    action: "allocation_release",
    targetType: "server",
    targetId: input.serverId,
    metadata: { released: result.released },
  });

  return c.json(result, 200);
});

export default allocations;
