import { zValidator } from "@hono/zod-validator";
import { RegionCreateSchema } from "@sigil/shared";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import { logAudit } from "../services/audit.service";
import { createRegion, deleteRegion, listRegions } from "../services/region.service";

const regions = new Hono<AuthContext>();

// Admin-only guard
regions.use("*", async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

regions.get("/", async (c) => {
  const result = await listRegions();
  return c.json(result);
});

regions.post("/", zValidator("json", RegionCreateSchema), async (c) => {
  const input = c.req.valid("json");

  try {
    const region = await createRegion(input);
    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: "region_create",
      targetType: "region",
      targetId: region.id,
      metadata: { name: region.name },
    });
    return c.json(region, 201);
  } catch (err) {
    const cause = err instanceof Error && "cause" in err ? (err.cause as { code?: string }) : err;
    if (cause instanceof Error && cause.message.includes("unique")) {
      return c.json(
        {
          error: { code: "REGION_NAME_EXISTS", message: "A region with this name already exists" },
        },
        409,
      );
    }
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") {
      return c.json(
        {
          error: { code: "REGION_NAME_EXISTS", message: "A region with this name already exists" },
        },
        409,
      );
    }
    throw err;
  }
});

regions.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await deleteRegion(id);

  if ("error" in result) {
    return c.json({ error: { code: "REGION_HAS_NODES", message: result.error } }, 409);
  }

  const user = c.get("user");
  await logAudit({
    userId: user?.id,
    action: "region_delete",
    targetType: "region",
    targetId: id,
  });

  return c.body(null, 204);
});

export default regions;
