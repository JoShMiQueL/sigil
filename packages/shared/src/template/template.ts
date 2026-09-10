import { z } from "zod";
import { PortMappingSchema, ResourceLimitsSchema } from "../server/config";
import { ChangelogSchema } from "./changelog";
import { VariableSchema } from "./variable";

export const ResourceLimitsRangeEntrySchema = z.object({
  min: z.number(),
  max: z.number(),
  recommended: z.number(),
});

export const ResourceLimitsRangeSchema = z.object({
  memoryMb: ResourceLimitsRangeEntrySchema.optional(),
  cpuLimit: ResourceLimitsRangeEntrySchema.optional(),
  pidsLimit: ResourceLimitsRangeEntrySchema.optional(),
});
export type ResourceLimitsRange = z.infer<typeof ResourceLimitsRangeSchema>;

export const TemplateSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  registryId: z.string().uuid().nullable(),
  sourceId: z.string().nullable(),
  sourceHash: z.string().nullable(),
  name: z.string().min(1).max(100),
  description: z.string().nullable(),
  author: z.string().nullable(),
  version: z.string().default("1.0.0"),
  image: z.string().min(1),
  startupCommand: z.string().min(1),
  stopSignal: z.string().default("^C"),
  environment: z.record(z.string(), z.string()).default({}),
  portMappings: z.array(PortMappingSchema).default([]),
  resourceLimits: ResourceLimitsSchema,
  resourceLimitsRange: ResourceLimitsRangeSchema.nullable(),
  changelog: ChangelogSchema.default([]),
  active: z.boolean().default(false),
  customized: z.boolean().default(false),
  variables: z.array(VariableSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Template = z.infer<typeof TemplateSchema>;

export const TemplateCreateSchema = z.object({
  groupId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  version: z.string().default("1.0.0"),
  image: z.string().min(1),
  startupCommand: z.string().min(1),
  stopSignal: z.string().default("^C"),
  environment: z.record(z.string(), z.string()).default({}),
  portMappings: z.array(PortMappingSchema).default([]),
  resourceLimits: ResourceLimitsSchema,
  resourceLimitsRange: ResourceLimitsRangeSchema.nullable().optional(),
  changelog: ChangelogSchema.default([]),
  variables: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        envVar: z.string().min(1).max(100),
        dataType: z.enum(["string", "integer", "boolean", "select"]),
        defaultValue: z.string(),
        required: z.boolean().default(false),
        minValue: z.number().int().nullable().optional(),
        maxValue: z.number().int().nullable().optional(),
        minLength: z.number().int().nullable().optional(),
        maxLength: z.number().int().nullable().optional(),
        regexPattern: z.string().nullable().optional(),
        allowedValues: z.array(z.string()).nullable().optional(),
        visibility: z.enum(["hidden", "viewable", "editable"]).default("editable"),
        sortOrder: z.number().int().default(0),
      }),
    )
    .default([]),
});
export type TemplateCreate = z.infer<typeof TemplateCreateSchema>;

export const TemplateUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  version: z.string().optional(),
  image: z.string().min(1).optional(),
  startupCommand: z.string().min(1).optional(),
  stopSignal: z.string().optional(),
  environment: z.record(z.string(), z.string()).optional(),
  portMappings: z.array(PortMappingSchema).optional(),
  resourceLimits: ResourceLimitsSchema.optional(),
  resourceLimitsRange: ResourceLimitsRangeSchema.nullable().optional(),
  changelog: ChangelogSchema.optional(),
  variables: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        envVar: z.string().min(1).max(100),
        dataType: z.enum(["string", "integer", "boolean", "select"]),
        defaultValue: z.string(),
        required: z.boolean().default(false),
        minValue: z.number().int().nullable().optional(),
        maxValue: z.number().int().nullable().optional(),
        minLength: z.number().int().nullable().optional(),
        maxLength: z.number().int().nullable().optional(),
        regexPattern: z.string().nullable().optional(),
        allowedValues: z.array(z.string()).nullable().optional(),
        visibility: z.enum(["hidden", "viewable", "editable"]).default("editable"),
        sortOrder: z.number().int().default(0),
      }),
    )
    .optional(),
});
export type TemplateUpdate = z.infer<typeof TemplateUpdateSchema>;

export const TemplateYAMLSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  author: z.string().optional(),
  version: z.string().default("1.0.0"),
  image: z.string().min(1),
  startupCommand: z.string().min(1),
  stopSignal: z.string().default("^C"),
  environment: z.record(z.string(), z.string()).default({}),
  portMappings: z
    .array(
      z.object({
        name: z.string(),
        protocol: z.string(),
        internalPort: z.number().int(),
        externalPort: z.number().int(),
      }),
    )
    .default([]),
  resourceLimits: ResourceLimitsSchema,
  resourceLimitsRange: ResourceLimitsRangeSchema.optional(),
  changelog: ChangelogSchema.default([]),
  variables: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        envVar: z.string().min(1).max(100),
        dataType: z.enum(["string", "integer", "boolean", "select"]),
        defaultValue: z.string(),
        required: z.boolean().default(false),
        minValue: z.number().int().nullable().optional(),
        maxValue: z.number().int().nullable().optional(),
        minLength: z.number().int().nullable().optional(),
        maxLength: z.number().int().nullable().optional(),
        regexPattern: z.string().nullable().optional(),
        allowedValues: z.array(z.string()).nullable().optional(),
        visibility: z.enum(["hidden", "viewable", "editable"]).default("editable"),
        sortOrder: z.number().int().default(0),
      }),
    )
    .default([]),
});
export type TemplateYAML = z.infer<typeof TemplateYAMLSchema>;
