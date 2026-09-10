import { serializeTemplateYAML } from "../lib/yaml-utils";
import { getTemplateById } from "./template.service";

export async function exportTemplate(
  id: string,
): Promise<{ yaml: string; filename: string } | null> {
  const template = await getTemplateById(id);
  if (!template) return null;

  const yaml = serializeTemplateYAML(template);
  const filename = `${template.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.yaml`;

  return { yaml, filename };
}
