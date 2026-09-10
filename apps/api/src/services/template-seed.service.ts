import { db, schema } from "@sigilpanel/db";
import { count, eq } from "drizzle-orm";
import { parseTemplateYAML } from "../lib/yaml-utils";
import { createHash } from "node:crypto";

const OFFICIAL_REGISTRY_URL =
  process.env.OFFICIAL_REGISTRY_URL ?? "https://raw.githubusercontent.com/sigilpanel/sigilpanel/main/templates";

async function isTemplatesEmpty(): Promise<boolean> {
  const [result] = await db.select({ value: count() }).from(schema.templates);
  return (result?.value ?? 0) === 0;
}

async function isOfficialRegistryExists(): Promise<boolean> {
  const [result] = await db
    .select({ value: count() })
    .from(schema.registries)
    .where(eq(schema.registries.isOfficial, true));
  return (result?.value ?? 0) > 0;
}

async function ensureOfficialRegistry(): Promise<typeof schema.registries.$inferSelect> {
  const existing = await isOfficialRegistryExists();
  if (existing) {
    const [row] = await db
      .select()
      .from(schema.registries)
      .where(eq(schema.registries.isOfficial, true))
      .limit(1);
    return row;
  }

  const [row] = await db
    .insert(schema.registries)
    .values({
      url: OFFICIAL_REGISTRY_URL,
      name: "Official",
      authMethod: "none",
      status: "ok",
      isOfficial: true,
    })
    .returning();
  return row;
}

async function ensureGroup(groupName: string): Promise<typeof schema.groups.$inferSelect> {
  const [existing] = await db
    .select()
    .from(schema.groups)
    .where(eq(schema.groups.name, groupName))
    .limit(1);
  if (existing) return existing;

  const [row] = await db
    .insert(schema.groups)
    .values({ name: groupName })
    .returning();
  return row;
}

async function readLocalTemplates(): Promise<Array<{ entry: { id: string; name: string; description?: string; group: string; author?: string; version: string; file: string; sha256: string }; content: string }>> {
  const indexPath = `${import.meta.dir}/../../../../templates/index.yaml`;
  const indexText = await Bun.file(indexPath).text();
  const index = Bun.YAML.parse(indexText) as { templates: Array<{ id: string; name: string; description?: string; group: string; author?: string; version: string; file: string; sha256: string }> };

  const results = [];
  for (const entry of index.templates) {
    const filePath = `${import.meta.dir}/../../../../templates/${entry.file}`;
    const content = await Bun.file(filePath).text();
    const sha256 = createHash("sha256").update(content).digest("hex");
    results.push({ entry: { ...entry, sha256 }, content });
  }
  return results;
}

export async function seedOfficialTemplates(): Promise<void> {
  if (!(await isTemplatesEmpty())) return;

  console.log("[seed] Seeding official templates...");
  const registry = await ensureOfficialRegistry();

  let templates: Array<{ entry: { id: string; name: string; description?: string; group: string; author?: string; version: string; file: string; sha256: string }; content: string }>;
  try {
    templates = await readLocalTemplates();
  } catch (err) {
    console.error("[seed] Failed to read local templates:", err);
    return;
  }

  for (const { entry, content } of templates) {
    try {
      const parsed = parseTemplateYAML(content);
      const group = await ensureGroup(entry.group);

      const [templateRow] = await db
        .insert(schema.templates)
        .values({
          groupId: group.id,
          registryId: registry.id,
          sourceId: entry.id,
          sourceHash: entry.sha256,
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
          active: true,
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

      console.log(`[seed] Installed template: ${parsed.name} v${parsed.version}`);
    } catch (err) {
      console.error(`[seed] Failed to install template ${entry.id}:`, err);
    }
  }

  console.log("[seed] Official templates seeded.");
}
