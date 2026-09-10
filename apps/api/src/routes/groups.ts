import { zValidator } from "@hono/zod-validator";
import { GroupCreateSchema, GroupUpdateSchema } from "@sigilpanel/shared";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import { logAudit } from "../services/audit.service";
import {
  createGroup,
  deleteGroup,
  getGroupById,
  listGroups,
  updateGroup,
} from "../services/group.service";

const groups = new Hono<AuthContext>();

groups.use("*", async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

groups.get("/", async (c) => {
  const result = await listGroups();
  return c.json(result);
});

groups.get("/:id", async (c) => {
  const id = c.req.param("id");
  const group = await getGroupById(id);
  if (!group) return c.json({ error: "Group not found" }, 404);
  return c.json(group);
});

groups.post("/", zValidator("json", GroupCreateSchema), async (c) => {
  const input = c.req.valid("json");

  try {
    const group = await createGroup(input);
    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: "group_create" as never,
      targetType: "group",
      targetId: group.id,
      metadata: { name: group.name },
    });
    return c.json(group, 201);
  } catch (err) {
    const cause = err instanceof Error && "cause" in err ? (err.cause as { code?: string }) : err;
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") {
      return c.json(
        { error: { code: "GROUP_NAME_EXISTS", message: "A group with this name already exists" } },
        409,
      );
    }
    throw err;
  }
});

groups.patch("/:id", zValidator("json", GroupUpdateSchema), async (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");

  try {
    const group = await updateGroup(id, input);
    if (!group) return c.json({ error: "Group not found" }, 404);

    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: "group_update" as never,
      targetType: "group",
      targetId: group.id,
      metadata: input,
    });
    return c.json(group);
  } catch (err) {
    const cause = err instanceof Error && "cause" in err ? (err.cause as { code?: string }) : err;
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") {
      return c.json(
        { error: { code: "GROUP_NAME_EXISTS", message: "A group with this name already exists" } },
        409,
      );
    }
    throw err;
  }
});

groups.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await deleteGroup(id);

  if ("error" in result) {
    if (result.error === "Group not found") return c.json({ error: result.error }, 404);
    return c.json({ error: result.error }, 409);
  }

  const user = c.get("user");
  await logAudit({
    userId: user?.id,
    action: "group_delete" as never,
    targetType: "group",
    targetId: id,
  });
  return c.json({ ok: true });
});

export default groups;
