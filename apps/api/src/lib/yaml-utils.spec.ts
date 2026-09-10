import type { Template } from "@sigil/shared";
import { describe, expect, it } from "vitest";
import { parseTemplateYAML, serializeTemplateYAML } from "./yaml-utils";

function makeTemplate(): Template {
  return {
    id: "test-id",
    registryId: null,
    sourceId: null,
    sourceHash: "abc123",
    name: "Paper MC",
    description: "Paper Minecraft server",
    author: "Sigil",
    version: "1.0.0",
    image: "eclipse-temurin:21-jre",
    startupCommand: "java -jar paper.jar nogui",
    stopSignal: "^C",
    environment: { JAVA_OPTS: "-Xms1G -Xmx1G" },
    portMappings: [{ hostPort: 25565, containerPort: 25565, protocol: "tcp", hostIp: "0.0.0.0" }],
    resourceLimits: { memoryMb: 1024, cpuLimit: 1.0, pidsLimit: 512 },
    resourceLimitsRange: {
      memoryMb: { min: 512, max: 8192, recommended: 2048 },
    },
    changelog: [
      {
        version: "1.0.0",
        date: "2026-09-10",
        changes: [{ type: "added", description: "Initial release" }],
      },
    ],
    tags: ["minecraft", "java", "paper"],
    active: true,
    customized: false,
    variables: [
      {
        id: "var-1",
        templateId: "test-id",
        name: "Max Players",
        envVar: "MAX_PLAYERS",
        dataType: "integer",
        defaultValue: "20",
        required: false,
        minValue: 1,
        maxValue: 100,
        minLength: null,
        maxLength: null,
        regexPattern: null,
        allowedValues: null,
        visibility: "editable",
        sortOrder: 0,
      },
    ],
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
  };
}

describe("YAML serialization round-trip [US6]", () => {
  it("serializes and parses back with all fields intact", () => {
    const template = makeTemplate();
    const yaml = serializeTemplateYAML(template);
    const parsed = parseTemplateYAML(yaml);

    expect(parsed.name).toBe(template.name);
    expect(parsed.description).toBe(template.description);
    expect(parsed.author).toBe(template.author);
    expect(parsed.version).toBe(template.version);
    expect(parsed.image).toBe(template.image);
    expect(parsed.startupCommand).toBe(template.startupCommand);
    expect(parsed.stopSignal).toBe(template.stopSignal);
    expect(parsed.environment).toEqual(template.environment);
    expect(parsed.resourceLimits).toEqual(template.resourceLimits);
    expect(parsed.resourceLimitsRange).toEqual(template.resourceLimitsRange);
  });

  it("preserves changelog entries", () => {
    const template = makeTemplate();
    const yaml = serializeTemplateYAML(template);
    const parsed = parseTemplateYAML(yaml);

    expect(parsed.changelog).toBeDefined();
    expect(parsed.changelog).toHaveLength(1);
    const entry = parsed.changelog?.[0];
    expect(entry?.version).toBe("1.0.0");
    expect(entry?.date).toBe("2026-09-10");
    expect(entry?.changes).toHaveLength(1);
    expect(entry?.changes[0].type).toBe("added");
    expect(entry?.changes[0].description).toBe("Initial release");
  });

  it("preserves variables with validation rules", () => {
    const template = makeTemplate();
    const yaml = serializeTemplateYAML(template);
    const parsed = parseTemplateYAML(yaml);

    expect(parsed.variables).toBeDefined();
    expect(parsed.variables).toHaveLength(1);
    const v = parsed.variables?.[0];
    expect(v?.name).toBe("Max Players");
    expect(v?.envVar).toBe("MAX_PLAYERS");
    expect(v?.dataType).toBe("integer");
    expect(v?.defaultValue).toBe("20");
    expect(v?.minValue).toBe(1);
    expect(v?.maxValue).toBe(100);
    expect(v?.visibility).toBe("editable");
  });

  it("preserves port mappings", () => {
    const template = makeTemplate();
    const yaml = serializeTemplateYAML(template);
    const parsed = parseTemplateYAML(yaml);

    expect(parsed.portMappings).toBeDefined();
    expect(parsed.portMappings).toHaveLength(1);
    const pm = parsed.portMappings?.[0];
    expect(pm?.internalPort).toBe(25565);
    expect(pm?.externalPort).toBe(25565);
    expect(pm?.protocol).toBe("tcp");
  });

  it("preserves tags", () => {
    const template = makeTemplate();
    const yaml = serializeTemplateYAML(template);
    const parsed = parseTemplateYAML(yaml);

    expect(parsed.tags).toBeDefined();
    expect(parsed.tags).toEqual(["minecraft", "java", "paper"]);
  });
});
