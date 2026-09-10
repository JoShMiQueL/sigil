# Shared Schemas Contract: Templates & Groups

**Feature**: 005-templates-groups (R8)
**Date**: 2026-09-10

All schemas live in `packages/shared/src/template/` and are re-exported from `packages/shared/src/index.ts`.

## Schemas

### GroupSchema

```typescript
export const GroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

### VariableSchema

```typescript
export const VariableDataTypeSchema = z.enum(["string", "integer", "boolean", "select"]);
export const VariableVisibilitySchema = z.enum(["hidden", "viewable", "editable"]);

export const VariableSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  name: z.string().min(1).max(100),
  envVar: z.string().min(1).max(100),
  dataType: VariableDataTypeSchema,
  defaultValue: z.string(),
  required: z.boolean().default(false),
  minValue: z.number().int().nullable(),
  maxValue: z.number().int().nullable(),
  minLength: z.number().int().nullable(),
  maxLength: z.number().int().nullable(),
  regexPattern: z.string().nullable(),
  allowedValues: z.array(z.string()).nullable(),
  visibility: VariableVisibilitySchema.default("editable"),
  sortOrder: z.number().int().default(0),
});
```

### TemplateSchema

```typescript
export const ResourceLimitsRangeSchema = z.object({
  memoryMb: z.object({
    min: z.number().int().min(128),
    max: z.number().int().max(65536),
    recommended: z.number().int(),
  }).optional(),
  cpuLimit: z.object({
    min: z.number().min(0.1),
    max: z.number().max(32),
    recommended: z.number(),
  }).optional(),
  pidsLimit: z.object({
    min: z.number().int().min(16),
    max: z.number().int().max(8192),
    recommended: z.number().int(),
  }).optional(),
});
export type ResourceLimitsRange = z.infer<typeof ResourceLimitsRangeSchema>;

### ChangelogSchema

```typescript
export const ChangeTypeSchema = z.enum([
  "added",
  "changed",
  "deprecated",
  "removed",
  "fixed",
  "security",
]);

export const ChangeSchema = z.object({
  type: ChangeTypeSchema,
  description: z.string().min(1),
});

export const ChangelogEntrySchema = z.object({
  version: z.string(),
  date: z.string(), // ISO date (YYYY-MM-DD)
  changes: z.array(ChangeSchema),
});

export const ChangelogSchema = z.array(ChangelogEntrySchema);
```

### TemplateSchema

```typescript
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
```

### RegistrySchema

```typescript
export const RegistryAuthMethodSchema = z.enum(["none", "token", "basic"]);
export const RegistryStatusSchema = z.enum(["ok", "auth_failed", "unreachable", "unknown"]);

export const RegistrySchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  name: z.string().min(1).max(100),
  authMethod: RegistryAuthMethodSchema.default("none"),
  hasCredentials: z.boolean(),
  status: RegistryStatusSchema.default("unknown"),
  lastCheckedAt: z.string().datetime().nullable(),
  isOfficial: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

Note: `token`, `username`, `password` are NEVER included in `RegistrySchema`. Only `hasCredentials` is exposed.

### RegistryIndexSchema (for parsing registry index.yaml)

```typescript
export const RegistryIndexEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  group: z.string(),
  author: z.string().optional(),
  version: z.string(),
  file: z.string(),
  sha256: z.string(),
});

export const RegistryIndexSchema = z.object({
  templates: z.array(RegistryIndexEntrySchema),
});
```

### PTDL_v2 Import Schemas (for parsing Pterodactyl eggs)

```typescript
export const PTDLv2VariableSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  env_variable: z.string(),
  default_value: z.string(),
  user_viewable: z.boolean().default(true),
  user_editable: z.boolean().default(false),
  rules: z.string(),
  field_type: z.string().default("text"),
});

export const PTDLv2EggSchema = z.object({
  meta: z.object({
    version: z.literal("PTDL_v2"),
    update_url: z.string().nullable().optional(),
  }),
  name: z.string().min(1).max(191),
  author: z.string(),
  description: z.string().optional(),
  features: z.array(z.string()).nullable().optional(),
  docker_images: z.record(z.string(), z.string()),
  file_denylist: z.array(z.string()).nullable().optional(),
  startup: z.string(),
  config: z.object({
    files: z.string().optional(),
    startup: z.string().optional(),
    logs: z.string().optional(),
    stop: z.string(),
  }),
  scripts: z.object({
    installation: z.object({
      script: z.string(),
      container: z.string(),
      entrypoint: z.string(),
    }),
  }).optional(),
  variables: z.array(PTDLv2VariableSchema).default([]),
});
```

### SSE Event Schemas

```typescript
// Added to SSEEventTypeSchema:
"template.create",
"template.update",
"template.delete",
"template.update_available",
"template.update_applied",
"group.create",
"group.update",
"group.delete",

// New payload schemas:
export const TemplateUpdateAvailablePayloadSchema = z.object({
  templateId: z.string().uuid(),
  templateName: z.string(),
  registryName: z.string(),
  sourceId: z.string(),
  oldVersion: z.string(),
  newVersion: z.string(),
  changes: z.array(ChangeSchema),
  customized: z.boolean(),
});

export const TemplateUpdateAppliedPayloadSchema = z.object({
  templateId: z.string().uuid(),
  templateName: z.string(),
  newVersion: z.string(),
});

export const TemplateCRUDPayloadSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  groupId: z.string().uuid(),
  active: z.boolean(),
});

export const GroupCRUDPayloadSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});
```

## File Layout

```
packages/shared/src/template/
├── group.ts        # GroupSchema
├── variable.ts     # VariableSchema, VariableDataTypeSchema, VariableVisibilitySchema
├── changelog.ts    # ChangelogSchema, ChangelogEntrySchema, ChangeSchema, ChangeTypeSchema
├── template.ts     # TemplateSchema (includes changelog)
├── registry.ts     # RegistrySchema, RegistryIndexSchema, RegistryAuthMethodSchema, RegistryStatusSchema
├── ptdlv2.ts       # PTDLv2EggSchema, PTDLv2VariableSchema
└── index.ts        # re-export all
```

Update `packages/shared/src/index.ts` to add:
```typescript
export * from "./template/group";
export * from "./template/variable";
export * from "./template/changelog";
export * from "./template/template";
export * from "./template/registry";
export * from "./template/ptdlv2";
```

Update `packages/shared/src/sse/events.ts` to add new event types and payloads.
