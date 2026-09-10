import { RegistryIndexSchema, TemplateYAMLSchema } from "@sigilpanel/shared";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function validateTemplates(): Promise<void> {
  const templatesDir = join(process.cwd(), "templates");
  let hasErrors = false;

  // Read and validate index.yaml
  const indexPath = join(templatesDir, "index.yaml");
  let indexEntries: Array<{ file: string; id: string; version: string }> = [];

  try {
    const indexContent = await readFile(indexPath, "utf-8");
    const indexData = Bun.YAML.parse(indexContent);
    const result = RegistryIndexSchema.safeParse(indexData);
    if (!result.success) {
      console.error("index.yaml validation failed:");
      for (const issue of result.error.issues) {
        console.error(`  ${issue.path.join(".")}: ${issue.message}`);
      }
      hasErrors = true;
    } else {
      indexEntries = result.data.templates;
      console.log(`index.yaml: ${indexEntries.length} templates registered`);
    }
  } catch (err) {
    console.error(`Failed to read index.yaml: ${err}`);
    hasErrors = true;
  }

  // Validate each template YAML file
  for (const entry of indexEntries) {
    const filePath = join(templatesDir, entry.file);
    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = Bun.YAML.parse(content);
      const result = TemplateYAMLSchema.safeParse(parsed);
      if (!result.success) {
        console.error(`${entry.file} validation failed:`);
        for (const issue of result.error.issues) {
          console.error(`  ${issue.path.join(".")}: ${issue.message}`);
        }
        hasErrors = true;
      } else {
        console.log(`  ${entry.file}: OK (${entry.id} v${result.data.version})`);
      }
    } catch (err) {
      console.error(`Failed to read ${entry.file}: ${err}`);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error("\nTemplate validation FAILED");
    process.exit(1);
  } else {
    console.log("\nAll templates valid");
  }
}

validateTemplates().catch((err) => {
  console.error(err);
  process.exit(1);
});
