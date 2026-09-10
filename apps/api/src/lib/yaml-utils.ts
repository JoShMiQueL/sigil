import type { Template } from "@sigilpanel/shared";

interface TemplateYAML {
  name: string;
  description?: string;
  author?: string;
  version: string;
  image: string;
  startupCommand: string;
  stopSignal?: string;
  environment?: Record<string, string>;
  portMappings?: Array<{ name: string; protocol: string; internalPort: number; externalPort: number }>;
  resourceLimits: { memoryMb: number; cpuLimit: number; pidsLimit?: number };
  resourceLimitsRange?: {
    memoryMb?: { min: number; max: number; recommended: number };
    cpuLimit?: { min: number; max: number; recommended: number };
    pidsLimit?: { min: number; max: number; recommended: number };
  };
  changelog?: Array<{
    version: string;
    date: string;
    changes: Array<{ type: string; description: string }>;
  }>;
  variables?: Array<{
    name: string;
    envVar: string;
    dataType: string;
    defaultValue: string;
    required?: boolean;
    minValue?: number;
    maxValue?: number;
    minLength?: number;
    maxLength?: number;
    regexPattern?: string;
    allowedValues?: string[];
    visibility?: string;
    sortOrder?: number;
  }>;
}

export function parseTemplateYAML(yamlText: string): TemplateYAML {
  const parsed = Bun.YAML.parse(yamlText);
  return parsed as TemplateYAML;
}

export function serializeTemplateYAML(template: Template): string {
  const yamlData: TemplateYAML = {
    name: template.name,
    description: template.description ?? undefined,
    author: template.author ?? undefined,
    version: template.version,
    image: template.image,
    startupCommand: template.startupCommand,
    stopSignal: template.stopSignal,
    environment: template.environment,
    portMappings: template.portMappings.map((p) => ({
      name: p.hostIp ?? "main",
      protocol: p.protocol,
      internalPort: p.containerPort,
      externalPort: p.hostPort,
    })),
    resourceLimits: template.resourceLimits,
    resourceLimitsRange: template.resourceLimitsRange ?? undefined,
    changelog: template.changelog,
    variables: template.variables.map((v) => ({
      name: v.name,
      envVar: v.envVar,
      dataType: v.dataType,
      defaultValue: v.defaultValue,
      required: v.required,
      minValue: v.minValue ?? undefined,
      maxValue: v.maxValue ?? undefined,
      minLength: v.minLength ?? undefined,
      maxLength: v.maxLength ?? undefined,
      regexPattern: v.regexPattern ?? undefined,
      allowedValues: v.allowedValues ?? undefined,
      visibility: v.visibility,
      sortOrder: v.sortOrder,
    })),
  };

  return Bun.YAML.stringify(yamlData);
}
