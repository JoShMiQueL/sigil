import { createHash } from "node:crypto";
import { db, schema } from "@sigilpanel/db";
import type {
  Registry,
  RegistryCreate,
  RegistryIndexEntry,
  RegistryUpdate,
} from "@sigilpanel/shared";
import { eq } from "drizzle-orm";
import {
  fetchRegistryIndex,
  fetchTemplateFile,
  RegistryAuthError,
  type RegistryCredentials,
} from "../lib/registry-fetch";
import { parseTemplateYAML } from "../lib/yaml-utils";
import { emit } from "./sse.service";

function toRegistry(row: typeof schema.registries.$inferSelect): Registry {
  return {
    id: row.id,
    url: row.url,
    name: row.name,
    authMethod: row.authMethod as "none" | "token" | "basic",
    hasCredentials: !!(row.token || (row.username && row.password)),
    status: row.status as "ok" | "auth_failed" | "unreachable" | "unknown",
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    isOfficial: row.isOfficial,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toCredentials(row: typeof schema.registries.$inferSelect): RegistryCredentials {
  return {
    url: row.url,
    authMethod: row.authMethod as "none" | "token" | "basic",
    token: row.token,
    username: row.username,
    password: row.password,
  };
}

export async function createRegistry(input: RegistryCreate): Promise<Registry> {
  const [row] = await db
    .insert(schema.registries)
    .values({
      url: input.url,
      name: input.name,
      authMethod: input.authMethod,
      token: input.token ?? null,
      username: input.username ?? null,
      password: input.password ?? null,
    })
    .returning();

  const registry = toRegistry(row);
  emit("registry.update", registry);
  return registry;
}

export async function listRegistries(): Promise<Registry[]> {
  const rows = await db.select().from(schema.registries).orderBy(schema.registries.createdAt);
  return rows.map(toRegistry);
}

export async function getRegistryById(id: string): Promise<Registry | null> {
  const [row] = await db
    .select()
    .from(schema.registries)
    .where(eq(schema.registries.id, id))
    .limit(1);
  return row ? toRegistry(row) : null;
}

export async function updateRegistry(id: string, input: RegistryUpdate): Promise<Registry | null> {
  const updates: Partial<typeof schema.registries.$inferInsert> = { updatedAt: new Date() };
  if (input.url !== undefined) updates.url = input.url;
  if (input.name !== undefined) updates.name = input.name;
  if (input.authMethod !== undefined) updates.authMethod = input.authMethod;
  if (input.token !== undefined) updates.token = input.token || null;
  if (input.username !== undefined) updates.username = input.username || null;
  if (input.password !== undefined) updates.password = input.password || null;

  const [row] = await db
    .update(schema.registries)
    .set(updates)
    .where(eq(schema.registries.id, id))
    .returning();

  if (!row) return null;
  const registry = toRegistry(row);
  emit("registry.update", registry);
  return registry;
}

export async function deleteRegistry(id: string): Promise<{ ok: true } | { error: string }> {
  await db
    .update(schema.templates)
    .set({ registryId: null })
    .where(eq(schema.templates.registryId, id));

  const [deleted] = await db
    .delete(schema.registries)
    .where(eq(schema.registries.id, id))
    .returning({ id: schema.registries.id });

  if (!deleted) return { error: "Registry not found" };
  return { ok: true };
}

export async function checkRegistry(
  id: string,
): Promise<{ status: Registry["status"]; availableCount: number }> {
  const [row] = await db
    .select()
    .from(schema.registries)
    .where(eq(schema.registries.id, id))
    .limit(1);
  if (!row) return { status: "unknown", availableCount: 0 };

  const credentials = toCredentials(row);

  try {
    const index = await fetchRegistryIndex(credentials);
    const installedSources = await getInstalledSourceIds(id);
    const available = index.templates.filter((t) => !installedSources.has(t.id));

    await db
      .update(schema.registries)
      .set({ status: "ok", lastCheckedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.registries.id, id));

    return { status: "ok", availableCount: available.length };
  } catch (err) {
    const status = err instanceof RegistryAuthError ? "auth_failed" : "unreachable";
    await db
      .update(schema.registries)
      .set({ status, lastCheckedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.registries.id, id));
    return { status, availableCount: 0 };
  }
}

export async function getAvailableTemplates(id: string): Promise<RegistryIndexEntry[]> {
  const [row] = await db
    .select()
    .from(schema.registries)
    .where(eq(schema.registries.id, id))
    .limit(1);
  if (!row) return [];

  const credentials = toCredentials(row);
  const index = await fetchRegistryIndex(credentials);
  const installedSources = await getInstalledSourceIds(id);

  return index.templates.filter((t) => !installedSources.has(t.id));
}

export async function installTemplate(
  registryId: string,
  sourceId: string,
): Promise<{ ok: true } | { error: string }> {
  const [row] = await db
    .select()
    .from(schema.registries)
    .where(eq(schema.registries.id, registryId))
    .limit(1);
  if (!row) return { error: "Registry not found" };

  const credentials = toCredentials(row);
  const index = await fetchRegistryIndex(credentials);
  const entry = index.templates.find((t) => t.id === sourceId);
  if (!entry) return { error: "Template not found in registry" };

  const yamlText = await fetchTemplateFile(credentials, entry);
  const parsed = parseTemplateYAML(yamlText);
  const sha256 = createHash("sha256").update(yamlText).digest("hex");

  const [templateRow] = await db
    .insert(schema.templates)
    .values({
      registryId,
      sourceId: entry.id,
      sourceHash: sha256,
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
      tags: [...new Set([...(entry.tags ?? []), ...(parsed.tags ?? [])])],
      active: false,
      customized: false,
    })
    .returning();

  if (parsed.variables && parsed.variables.length > 0) {
    await db.insert(schema.variables).values(
      parsed.variables.map((v) => ({
        templateId: templateRow.id,
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

  return { ok: true };
}

async function getInstalledSourceIds(registryId: string): Promise<Set<string>> {
  const rows = await db
    .select({ sourceId: schema.templates.sourceId })
    .from(schema.templates)
    .where(eq(schema.templates.registryId, registryId));

  return new Set(rows.map((r) => r.sourceId).filter((id): id is string => id !== null));
}
