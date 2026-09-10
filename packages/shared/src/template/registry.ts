import { z } from "zod";

export const RegistryAuthMethodSchema = z.enum(["none", "token", "basic"]);
export type RegistryAuthMethod = z.infer<typeof RegistryAuthMethodSchema>;

export const RegistryStatusSchema = z.enum(["ok", "auth_failed", "unreachable", "unknown"]);
export type RegistryStatus = z.infer<typeof RegistryStatusSchema>;

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
export type Registry = z.infer<typeof RegistrySchema>;

export const RegistryCreateSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(100),
  authMethod: RegistryAuthMethodSchema.default("none"),
  token: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});
export type RegistryCreate = z.infer<typeof RegistryCreateSchema>;

export const RegistryUpdateSchema = z.object({
  url: z.string().url().optional(),
  name: z.string().min(1).max(100).optional(),
  authMethod: RegistryAuthMethodSchema.optional(),
  token: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});
export type RegistryUpdate = z.infer<typeof RegistryUpdateSchema>;

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
export type RegistryIndexEntry = z.infer<typeof RegistryIndexEntrySchema>;

export const RegistryIndexSchema = z.object({
  templates: z.array(RegistryIndexEntrySchema),
});
export type RegistryIndex = z.infer<typeof RegistryIndexSchema>;
