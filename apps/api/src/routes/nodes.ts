import { zValidator } from "@hono/zod-validator";
import { NodeUpdateSchema } from "@sigilpanel/shared";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
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
  return c.json(node);
});

nodes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await deleteNode(id);

  if ("error" in result) {
    return c.json({ error: result.error }, 404);
  }

  return c.body(null, 204);
});

nodes.post("/:id/credentials/regenerate", async (c) => {
  const id = c.req.param("id");
  const result = await regenerateCredentials(id);

  if ("error" in result) {
    return c.json({ error: result.error }, 404);
  }

  return c.json(result, 201);
});

nodes.post("/:id/credentials/revoke", async (c) => {
  const id = c.req.param("id");
  const result = await revokeCredentials(id);

  if ("error" in result) {
    return c.json({ error: result.error }, 404);
  }

  return c.body(null, 204);
});

export default nodes;
