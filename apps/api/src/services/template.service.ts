import { createHash } from "node:crypto";
import { db, schema } from "@sigilpanel/db";
import type { Template, TemplateCreate, TemplateUpdate } from "@sigilpanel/shared";
import { eq } from "drizzle-orm";
import {
  fetchRegistryIndex,
  fetchTemplateFile,
  type RegistryCredentials,
} from "../lib/registry-fetch";
import { parseTemplateYAML } from "../lib/yaml-utils";
import { emit } from "./sse.service";
import { validateVariables } from "./variable-validation";

function toTemplate(
  row: typeof schema.templates.$inferSelect,
  vars: (typeof schema.variables.$inferSelect)[],
): Template {
  return {
    id: row.id,
    registryId: row.registryId,
    sourceId: row.sourceId,
    sourceHash: row.sourceHash,
    name: row.name,
    description: row.description,
    author: row.author,
    version: row.version,
    image: row.image,
    startupCommand: row.startupCommand,
    stopSignal: row.stopSignal,
    environment: row.environment as Record<string, string>,
    portMappings: row.portMappings as Template["portMappings"],
    resourceLimits: row.resourceLimits as Template["resourceLimits"],
    resourceLimitsRange: row.resourceLimitsRange as Template["resourceLimitsRange"],
    changelog: row.changelog as Template["changelog"],
    tags: row.tags ?? [],
    active: row.active,
    customized: row.customized,
    variables: vars.map((v) => ({
      id: v.id,
      templateId: v.templateId,
      name: v.name,
      envVar: v.envVar,
      dataType: v.dataType as "string" | "integer" | "boolean" | "select",
      defaultValue: v.defaultValue,
      required: v.required,
      minValue: v.minValue,
      maxValue: v.maxValue,
      minLength: v.minLength,
      maxLength: v.maxLength,
      regexPattern: v.regexPattern,
      allowedValues: v.allowedValues as string[] | null,
      visibility: v.visibility as "hidden" | "viewable" | "editable",
      sortOrder: v.sortOrder,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getTemplateVariables(
  templateId: string,
): Promise<(typeof schema.variables.$inferSelect)[]> {
  return db
    .select()
    .from(schema.variables)
    .where(eq(schema.variables.templateId, templateId))
    .orderBy(schema.variables.sortOrder);
}

export async function createTemplate(input: TemplateCreate): Promise<Template> {
  if (input.variables && input.variables.length > 0) {
    validateVariables(input.variables);
  }

  const [row] = await db
    .insert(schema.templates)
    .values({
      name: input.name,
      description: input.description ?? null,
      author: input.author ?? null,
      version: input.version,
      image: input.image,
      startupCommand: input.startupCommand,
      stopSignal: input.stopSignal,
      environment: input.environment,
      portMappings: input.portMappings,
      resourceLimits: input.resourceLimits,
      resourceLimitsRange: input.resourceLimitsRange ?? null,
      changelog: input.changelog,
      tags: input.tags ?? [],
      active: false,
      customized: false,
    })
    .returning();

  if (input.variables && input.variables.length > 0) {
    await db.insert(schema.variables).values(
      input.variables.map((v) => ({
        templateId: row.id,
        name: v.name,
        envVar: v.envVar,
        dataType: v.dataType,
        defaultValue: v.defaultValue,
        required: v.required,
        minValue: v.minValue ?? null,
        maxValue: v.maxValue ?? null,
        minLength: v.minLength ?? null,
        maxLength: v.maxLength ?? null,
        regexPattern: v.regexPattern ?? null,
        allowedValues: v.allowedValues ?? null,
        visibility: v.visibility,
        sortOrder: v.sortOrder,
      })),
    );
  }

  const vars = await getTemplateVariables(row.id);
  const template = toTemplate(row, vars);
  emit("template.create", template);
  return template;
}

export async function listTemplates(opts: {
  tag?: string;
  activeOnly?: boolean;
  role?: "admin" | "user";
}): Promise<Template[]> {
  const rows = await db.select().from(schema.templates).orderBy(schema.templates.createdAt);
  const result: Template[] = [];
  for (const row of rows) {
    if (opts.activeOnly && !row.active) continue;
    if (opts.tag && !(row.tags ?? []).includes(opts.tag)) continue;
    const vars = await getTemplateVariables(row.id);
    result.push(toTemplate(row, vars));
  }
  return result;
}

export async function getTemplateById(id: string): Promise<Template | null> {
  const [row] = await db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.id, id))
    .limit(1);
  if (!row) return null;
  const vars = await getTemplateVariables(row.id);
  return toTemplate(row, vars);
}

export async function updateTemplate(id: string, input: TemplateUpdate): Promise<Template | null> {
  const updates: Partial<typeof schema.templates.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description ?? null;
  if (input.author !== undefined) updates.author = input.author ?? null;
  if (input.version !== undefined) updates.version = input.version;
  if (input.image !== undefined) updates.image = input.image;
  if (input.startupCommand !== undefined) updates.startupCommand = input.startupCommand;
  if (input.stopSignal !== undefined) updates.stopSignal = input.stopSignal;
  if (input.environment !== undefined) updates.environment = input.environment;
  if (input.portMappings !== undefined) updates.portMappings = input.portMappings;
  if (input.resourceLimits !== undefined) updates.resourceLimits = input.resourceLimits;
  if (input.resourceLimitsRange !== undefined)
    updates.resourceLimitsRange = input.resourceLimitsRange ?? null;
  if (input.changelog !== undefined) updates.changelog = input.changelog;
  if (input.tags !== undefined) updates.tags = input.tags;

  const [existing] = await db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.id, id))
    .limit(1);
  if (!existing) return null;

  if (existing.registryId) {
    updates.customized = true;
  }

  const [row] = await db
    .update(schema.templates)
    .set(updates)
    .where(eq(schema.templates.id, id))
    .returning();

  if (input.variables !== undefined) {
    validateVariables(input.variables);
    await db.delete(schema.variables).where(eq(schema.variables.templateId, id));
    if (input.variables.length > 0) {
      await db.insert(schema.variables).values(
        input.variables.map((v) => ({
          templateId: id,
          name: v.name,
          envVar: v.envVar,
          dataType: v.dataType,
          defaultValue: v.defaultValue,
          required: v.required,
          minValue: v.minValue ?? null,
          maxValue: v.maxValue ?? null,
          minLength: v.minLength ?? null,
          maxLength: v.maxLength ?? null,
          regexPattern: v.regexPattern ?? null,
          allowedValues: v.allowedValues ?? null,
          visibility: v.visibility,
          sortOrder: v.sortOrder,
        })),
      );
    }
  }

  const vars = await getTemplateVariables(row.id);
  const template = toTemplate(row, vars);
  emit("template.update", template);
  return template;
}

export async function deleteTemplate(id: string): Promise<{ ok: true } | { error: string }> {
  // NOTE: servers table is R9, so in R8 this check always passes.
  // The FK constraint and server count check will be added in R9.
  const [deleted] = await db
    .delete(schema.templates)
    .where(eq(schema.templates.id, id))
    .returning({ id: schema.templates.id });

  if (!deleted) return { error: "Template not found" };

  emit("template.delete", { id, deleted: true });
  return { ok: true };
}

export async function activateTemplate(id: string): Promise<Template | null> {
  const [row] = await db
    .update(schema.templates)
    .set({ active: true, updatedAt: new Date() })
    .where(eq(schema.templates.id, id))
    .returning();

  if (!row) return null;
  const vars = await getTemplateVariables(row.id);
  const template = toTemplate(row, vars);
  emit("template.update", template);
  return template;
}

export async function deactivateTemplate(id: string): Promise<Template | null> {
  const [row] = await db
    .update(schema.templates)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(schema.templates.id, id))
    .returning();

  if (!row) return null;
  const vars = await getTemplateVariables(row.id);
  const template = toTemplate(row, vars);
  emit("template.update", template);
  return template;
}

export async function resetToUpstream(id: string): Promise<Template | null> {
  const [row] = await db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.id, id))
    .limit(1);
  if (!row?.registryId || !row.sourceId) return null;

  const [registry] = await db
    .select()
    .from(schema.registries)
    .where(eq(schema.registries.id, row.registryId))
    .limit(1);
  if (!registry) return null;

  const credentials: RegistryCredentials = {
    url: registry.url,
    authMethod: registry.authMethod as "none" | "token" | "basic",
    token: registry.token,
    username: registry.username,
    password: registry.password,
  };

  const index = await fetchRegistryIndex(credentials);
  const entry = index.templates.find((t) => t.id === row.sourceId);
  if (!entry) return null;

  const yamlText = await fetchTemplateFile(credentials, entry);
  const parsed = parseTemplateYAML(yamlText);
  const sha256 = createHash("sha256").update(yamlText).digest("hex");

  const [updated] = await db
    .update(schema.templates)
    .set({
      name: parsed.name,
      description: parsed.description ?? null,
      author: parsed.author ?? entry.author ?? null,
      version: parsed.version,
      image: parsed.image,
      startupCommand: parsed.startupCommand,
      stopSignal: parsed.stopSignal ?? "^C",
      environment: parsed.environment ?? {},
      portMappings: parsed.portMappings ?? [],
      resourceLimits: parsed.resourceLimits,
      resourceLimitsRange: parsed.resourceLimitsRange ?? null,
      changelog: parsed.changelog ?? [],
      tags: parsed.tags ?? [],
      sourceHash: sha256,
      customized: false,
      updatedAt: new Date(),
    })
    .where(eq(schema.templates.id, id))
    .returning();

  await db.delete(schema.variables).where(eq(schema.variables.templateId, id));
  if (parsed.variables && parsed.variables.length > 0) {
    await db.insert(schema.variables).values(
      parsed.variables.map((v) => ({
        templateId: id,
        name: v.name,
        envVar: v.envVar,
        dataType: v.dataType,
        defaultValue: v.defaultValue,
        required: v.required ?? false,
        minValue: v.minValue ?? null,
        maxValue: v.maxValue ?? null,
        minLength: v.minLength ?? null,
        maxLength: v.maxLength ?? null,
        regexPattern: v.regexPattern ?? null,
        allowedValues: v.allowedValues ?? null,
        visibility: v.visibility ?? "editable",
        sortOrder: v.sortOrder ?? 0,
      })),
    );
  }

  const vars = await getTemplateVariables(updated.id);
  const template = toTemplate(updated, vars);
  emit("template.update", template);
  return template;
}
