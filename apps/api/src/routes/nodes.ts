import { zValidator } from "@hono/zod-validator";
import { NodeUpdateSchema } from "@sigilpanel/shared";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import { getNodeById, listNodes } from "../services/node.service";

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

export default nodes;
