import { zValidator } from "@hono/zod-validator";
import { RegistryCreateSchema, RegistryUpdateSchema } from "@sigil/shared";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import { logAudit } from "../services/audit.service";
import {
  checkRegistry,
  createRegistry,
  deleteRegistry,
  getAvailableTemplates,
  getRegistryById,
  installTemplate,
  listRegistries,
  updateRegistry,
} from "../services/registry.service";

const registries = new Hono<AuthContext>();

registries.use("*", async (c, next) => {
  const user = c.get("user");
  if (user?.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

registries.get("/", async (c) => {
  const result = await listRegistries();
  return c.json(result);
});

registries.get("/:id", async (c) => {
  const id = c.req.param("id");
  const registry = await getRegistryById(id);
  if (!registry) return c.json({ error: "Registry not found" }, 404);
  return c.json(registry);
});

registries.post("/", zValidator("json", RegistryCreateSchema), async (c) => {
  const input = c.req.valid("json");

  try {
    const registry = await createRegistry(input);
    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: "registry_create" as never,
      targetType: "registry",
      targetId: registry.id,
    });
    return c.json(registry, 201);
  } catch (err) {
    const cause = err instanceof Error && "cause" in err ? (err.cause as { code?: string }) : err;
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") {
      return c.json(
        {
          error: {
            code: "REGISTRY_NAME_EXISTS",
            message: "A registry with this name already exists",
          },
        },
        409,
      );
    }
    throw err;
  }
});

registries.patch("/:id", zValidator("json", RegistryUpdateSchema), async (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");

  try {
    const registry = await updateRegistry(id, input);
    if (!registry) return c.json({ error: "Registry not found" }, 404);

    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: "registry_update" as never,
      targetType: "registry",
      targetId: registry.id,
    });
    return c.json(registry);
  } catch (err) {
    const cause = err instanceof Error && "cause" in err ? (err.cause as { code?: string }) : err;
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") {
      return c.json(
        {
          error: {
            code: "REGISTRY_NAME_EXISTS",
            message: "A registry with this name already exists",
          },
        },
        409,
      );
    }
    throw err;
  }
});

registries.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await deleteRegistry(id);

  if ("error" in result) {
    return c.json({ error: result.error }, 404);
  }

  const user = c.get("user");
  await logAudit({
    userId: user?.id,
    action: "registry_delete" as never,
    targetType: "registry",
    targetId: id,
  });
  return c.json({ ok: true });
});

registries.post("/:id/check", async (c) => {
  const id = c.req.param("id");
  const result = await checkRegistry(id);
  return c.json(result);
});

registries.get("/:id/available", async (c) => {
  const id = c.req.param("id");
  try {
    const available = await getAvailableTemplates(id);
    return c.json(available);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch available templates";
    return c.json({ error: message }, 502);
  }
});

registries.post("/:id/install", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ sourceId: string }>();

  if (!body.sourceId) {
    return c.json({ error: "sourceId is required" }, 400);
  }

  try {
    const result = await installTemplate(id, body.sourceId);
    if ("error" in result) {
      return c.json({ error: result.error }, 400);
    }

    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: "template_install" as never,
      targetType: "registry",
      targetId: id,
      metadata: { sourceId: body.sourceId },
    });
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to install template";
    return c.json({ error: message }, 502);
  }
});

export default registries;
