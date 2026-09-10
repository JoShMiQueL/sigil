import type { PTDLv2Egg, TemplateCreate, VariableCreate } from "@sigilpanel/shared";
import { PTDLv2EggSchema } from "@sigilpanel/shared";
import { convertPTDLv2Variables, getSkippedFields } from "../lib/ptdlv2-converter";
import { parseTemplateYAML } from "../lib/yaml-utils";
import { createTemplate, updateTemplate } from "./template.service";

export interface ImportResult {
  templateId: string;
  skippedFields: string[];
  conflict: "created" | "overwritten" | "skipped";
}

export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportValidationError";
  }
}

export async function importTemplateFile(
  fileContent: string,
  groupId: string,
  conflictStrategy: "overwrite" | "skip" = "skip",
): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch {
    try {
      parsed = parseTemplateYAML(fileContent);
    } catch {
      throw new ImportValidationError("File is not valid JSON or YAML");
    }
  }

  const eggResult = PTDLv2EggSchema.safeParse(parsed);
  if (eggResult.success) {
    return importPTDLv2Egg(eggResult.data, groupId, conflictStrategy);
  }

  throw new ImportValidationError(
    `Invalid PTDL_v2 egg: ${eggResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
  );
}

async function importPTDLv2Egg(
  egg: PTDLv2Egg,
  groupId: string,
  conflictStrategy: "overwrite" | "skip",
): Promise<ImportResult> {
  const variables: VariableCreate[] = convertPTDLv2Variables(egg.variables);
  const skippedFields = getSkippedFields(egg);

  // Pick the first docker image from the record
  const imageKeys = Object.keys(egg.docker_images);
  const image = imageKeys.length > 0 ? egg.docker_images[imageKeys[0]] : "unknown:latest";

  const templateInput: TemplateCreate = {
    groupId,
    name: egg.name,
    description: egg.description,
    author: egg.author,
    version: "1.0.0",
    image,
    startupCommand: egg.startup,
    stopSignal: egg.config.stop || "^C",
    environment: {},
    portMappings: [],
    resourceLimits: { memoryMb: 1024, cpuLimit: 1.0, pidsLimit: 512 },
    changelog: [],
    variables,
  };

  // Check for existing template with same name in the group
  const existing = await findTemplateByName(templateInput.name, groupId);

  if (existing) {
    if (conflictStrategy === "skip") {
      return {
        templateId: existing.id,
        skippedFields,
        conflict: "skipped",
      };
    }
    // overwrite
    const { groupId: _omit, ...updateInput } = templateInput;
    const updated = await updateTemplate(existing.id, updateInput);
    return {
      templateId: updated?.id ?? existing.id,
      skippedFields,
      conflict: "overwritten",
    };
  }

  const created = await createTemplate(templateInput);
  return {
    templateId: created.id,
    skippedFields,
    conflict: "created",
  };
}

async function findTemplateByName(name: string, _groupId: string): Promise<{ id: string } | null> {
  // We need to check if a template with the same name exists in the group.
  // Since listTemplates doesn't filter by name, we'll use the DB directly.
  const { db, schema } = await import("@sigilpanel/db");
  const { eq, and } = await import("drizzle-orm");
  const [row] = await db
    .select({ id: schema.templates.id })
    .from(schema.templates)
    .where(and(eq(schema.templates.name, name), eq(schema.templates.groupId, _groupId)))
    .limit(1);
  return row ?? null;
}
