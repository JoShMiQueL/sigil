import { zValidator } from "@hono/zod-validator";
import { TemplateCreateSchema, TemplateUpdateSchema } from "@sigilpanel/shared";
import { Hono } from "hono";
import type { AuthContext } from "../middleware/auth";
import { logAudit } from "../services/audit.service";
import {
  activateTemplate,
  createTemplate,
  deactivateTemplate,
  deleteTemplate,
  getTemplateById,
  listTemplates,
  resetToUpstream,
  updateTemplate,
} from "../services/template.service";
import { VariableValidationError } from "../services/variable-validation";

const templates = new Hono<AuthContext>();

// List and get are accessible to all authenticated users (active-only for non-admins)
templates.get("/", async (c) => {
  const user = c.get("user");
  const groupId = c.req.query("groupId");
  const activeOnly = user?.role !== "admin";
  const result = await listTemplates({ groupId, activeOnly, role: user?.role });
  return c.json(result);
});

templates.get("/:id", async (c) => {
  const id = c.req.param("id");
  const template = await getTemplateById(id);
  if (!template) return c.json({ error: "Template not found" }, 404);

  const user = c.get("user");
  if (user?.role !== "admin" && !template.active) {
    return c.json({ error: "Template not found" }, 404);
  }

  return c.json(template);
});

// Mutations are admin-only
templates.use("*", async (c, next) => {
  if (c.req.method === "GET") return next();
  const user = c.get("user");
  if (user?.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});

templates.post("/", zValidator("json", TemplateCreateSchema), async (c) => {
  const input = c.req.valid("json");

  try {
    const template = await createTemplate(input);
    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: "template_create" as never,
      targetType: "template",
      targetId: template.id,
    });
    return c.json(template, 201);
  } catch (err) {
    if (err instanceof VariableValidationError) {
      return c.json({ error: { code: "VARIABLE_VALIDATION", message: err.message, field: err.field } }, 400);
    }
    const cause = err instanceof Error && "cause" in err ? (err.cause as { code?: string }) : err;
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") {
      return c.json(
        { error: { code: "TEMPLATE_NAME_EXISTS", message: "A template with this name already exists in this group" } },
        409,
      );
    }
    throw err;
  }
});

templates.patch("/:id", zValidator("json", TemplateUpdateSchema), async (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");

  try {
    const template = await updateTemplate(id, input);
    if (!template) return c.json({ error: "Template not found" }, 404);

    const user = c.get("user");
    await logAudit({
      userId: user?.id,
      action: "template_update" as never,
      targetType: "template",
      targetId: template.id,
    });
    return c.json(template);
  } catch (err) {
    if (err instanceof VariableValidationError) {
      return c.json({ error: { code: "VARIABLE_VALIDATION", message: err.message, field: err.field } }, 400);
    }
    const cause = err instanceof Error && "cause" in err ? (err.cause as { code?: string }) : err;
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") {
      return c.json(
        { error: { code: "TEMPLATE_NAME_EXISTS", message: "A template with this name already exists in this group" } },
        409,
      );
    }
    throw err;
  }
});

templates.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await deleteTemplate(id);

  if ("error" in result) {
    return c.json({ error: result.error }, 404);
  }

  const user = c.get("user");
  await logAudit({
    userId: user?.id,
    action: "template_delete" as never,
    targetType: "template",
    targetId: id,
  });
  return c.json({ ok: true });
});

templates.post("/:id/activate", async (c) => {
  const id = c.req.param("id");
  const template = await activateTemplate(id);
  if (!template) return c.json({ error: "Template not found" }, 404);
  return c.json(template);
});

templates.post("/:id/deactivate", async (c) => {
  const id = c.req.param("id");
  const template = await deactivateTemplate(id);
  if (!template) return c.json({ error: "Template not found" }, 404);
  return c.json(template);
});

templates.post("/:id/reset", async (c) => {
  const id = c.req.param("id");
  try {
    const template = await resetToUpstream(id);
    if (!template) return c.json({ error: "Template not found or not from a registry" }, 404);
    return c.json(template);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reset template";
    return c.json({ error: message }, 502);
  }
});

export default templates;
