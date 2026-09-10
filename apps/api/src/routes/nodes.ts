import { zValidator } from "@hono/zod-validator";
import { NodeUpdateSchema } from "@sigil/shared";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import { logAudit } from "../services/audit.service";
import {
  deleteNode,
  getNodeById,
  listNodes,
  regenerateCredentials,
  revokeCredentials,
  updateNode,
} from "../services/node.service";

const nodes = new Hono<AuthContext>();

// Admin-only guard
nodes.use("*", async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

nodes.get("/", async (c) => {
  const regionId = c.req.query("region_id") ?? undefined;
  const result = await listNodes(regionId);
  return c.json(result);
});

nodes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const node = await getNodeById(id);
  if (!node) {
    return c.json({ error: "Node not found" }, 404);
  }
  return c.json(node);
});

nodes.patch("/:id", zValidator("json", NodeUpdateSchema), async (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");

  const node = await updateNode(id, input);
  if (!node) {
    return c.json({ error: "Node not found" }, 404);
  }

  const user = c.get("user");
  await logAudit({
    userId: user?.id,
    action: "node_update",
    targetType: "node",
    targetId: id,
    metadata: input,
  });

  return c.json(node);
});

nodes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await deleteNode(id);

  if ("error" in result) {
    const status =
      result.code === "NODE_HAS_SERVERS" || result.code === "NODE_HAS_ASSIGNED_ALLOCATIONS"
        ? 409
        : 404;
    return c.json({ error: { code: result.code, message: result.error } }, status);
  }

  const user = c.get("user");
  await logAudit({
    userId: user?.id,
    action: "node_delete",
    targetType: "node",
    targetId: id,
  });

  return c.body(null, 204);
});

nodes.post("/:id/credentials/regenerate", async (c) => {
  const id = c.req.param("id");
  const result = await regenerateCredentials(id);

  if ("error" in result) {
    return c.json({ error: result.error }, 404);
  }

  const user = c.get("user");
  await logAudit({
    userId: user?.id,
    action: "node_credential_regenerate",
    targetType: "node",
    targetId: id,
  });

  return c.json(result, 201);
});

nodes.post("/:id/credentials/revoke", async (c) => {
  const id = c.req.param("id");
  const result = await revokeCredentials(id);

  if ("error" in result) {
    return c.json({ error: result.error }, 404);
  }

  const user = c.get("user");
  await logAudit({
    userId: user?.id,
    action: "node_credential_revoke",
    targetType: "node",
    targetId: id,
  });

  return c.body(null, 204);
});

export default nodes;
