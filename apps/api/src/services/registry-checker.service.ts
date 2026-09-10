import { createHash } from "node:crypto";
import { db, schema } from "@sigil/db";
import type { ChangelogEntry } from "@sigil/shared";
import { eq } from "drizzle-orm";
import {
  fetchRegistryIndex,
  fetchTemplateFile,
  RegistryAuthError,
  type RegistryCredentials,
} from "../lib/registry-fetch";
import { parseTemplateYAML } from "../lib/yaml-utils";
import { emit } from "./sse.service";

interface UpdateDetection {
  templateId: string;
  templateName: string;
  registryId: string;
  sourceId: string;
  oldVersion: string;
  newVersion: string;
  oldHash: string;
  newHash: string;
  changes: ChangelogEntry["changes"];
  customized: boolean;
}

export async function checkAllRegistries(): Promise<UpdateDetection[]> {
  const registries = await db.select().from(schema.registries);

  const allDetections: UpdateDetection[] = [];

  for (const registry of registries) {
    try {
      const detections = await checkRegistry(registry);
      allDetections.push(...detections);
    } catch (err) {
      const status = err instanceof RegistryAuthError ? "auth_failed" : "unreachable";
      await db
        .update(schema.registries)
        .set({ status, lastCheckedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.registries.id, registry.id));
    }
  }

  return allDetections;
}

async function checkRegistry(
  registry: typeof schema.registries.$inferSelect,
): Promise<UpdateDetection[]> {
  const credentials: RegistryCredentials = {
    url: registry.url,
    authMethod: registry.authMethod as "none" | "token" | "basic",
    token: registry.token,
    username: registry.username,
    password: registry.password,
  };

  const index = await fetchRegistryIndex(credentials);

  await db
    .update(schema.registries)
    .set({ status: "ok", lastCheckedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.registries.id, registry.id));

  const templates = await db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.registryId, registry.id));

  const detections: UpdateDetection[] = [];

  for (const template of templates) {
    if (!template.sourceId) continue;

    const entry = index.templates.find((t) => t.id === template.sourceId);
    if (!entry) continue;

    if (entry.sha256 !== template.sourceHash) {
      try {
        const yamlText = await fetchTemplateFile(credentials, entry);
        const parsed = parseTemplateYAML(yamlText);

        const latestChangelog = parsed.changelog?.[0];
        const changes = (latestChangelog?.changes ?? []) as ChangelogEntry["changes"];

        const detection: UpdateDetection = {
          templateId: template.id,
          templateName: template.name,
          registryId: registry.id,
          sourceId: template.sourceId,
          oldVersion: template.version,
          newVersion: entry.version,
          oldHash: template.sourceHash ?? "",
          newHash: entry.sha256,
          changes,
          customized: template.customized,
        };

        emit("template.update_available", {
          templateId: detection.templateId,
          templateName: detection.templateName,
          oldVersion: detection.oldVersion,
          newVersion: detection.newVersion,
          changes: detection.changes,
          customized: detection.customized,
        });

        detections.push(detection);
      } catch {
        // Skip individual template fetch errors
      }
    }
  }

  return detections;
}

export async function applyUpdate(templateId: string): Promise<{ ok: true } | { error: string }> {
  const [template] = await db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.id, templateId))
    .limit(1);

  if (!template) return { error: "Template not found" };
  if (!template.registryId || !template.sourceId)
    return { error: "Template is not from a registry" };

  const [registry] = await db
    .select()
    .from(schema.registries)
    .where(eq(schema.registries.id, template.registryId))
    .limit(1);

  if (!registry) return { error: "Registry not found" };

  const credentials: RegistryCredentials = {
    url: registry.url,
    authMethod: registry.authMethod as "none" | "token" | "basic",
    token: registry.token,
    username: registry.username,
    password: registry.password,
  };

  const index = await fetchRegistryIndex(credentials);
  const entry = index.templates.find((t) => t.id === template.sourceId);
  if (!entry) return { error: "Template not found in registry" };

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
      sourceHash: sha256,
      customized: false,
      updatedAt: new Date(),
    })
    .where(eq(schema.templates.id, templateId))
    .returning();

  await db.delete(schema.variables).where(eq(schema.variables.templateId, templateId));
  if (parsed.variables && parsed.variables.length > 0) {
    await db.insert(schema.variables).values(
      parsed.variables.map((v) => ({
        templateId,
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

  // NOTE: Does NOT modify existing servers — that is R9 scope.
  // No "servers need updating" indicator in R8.
  emit("template.update_applied", {
    templateId: updated.id,
    templateName: updated.name,
    version: updated.version,
  });

  return { ok: true };
}

export function startRegistryChecker(): void {
  if (process.env.NODE_ENV === "test") return;

  Bun.cron("@hourly", async () => {
    try {
      await checkAllRegistries();
    } catch {
      // Background job errors are non-fatal
    }
  });
}
