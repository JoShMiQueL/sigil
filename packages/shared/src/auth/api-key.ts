import { z } from "zod";

export const ApiKeyScopeSchema = z.enum([
  "read",
  "control",
  "files",
  "databases",
  "backups",
  "allocations",
  "settings",
  "users",
]);
export type ApiKeyScope = z.infer<typeof ApiKeyScopeSchema>;

export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(64),
  keyPrefix: z.string(),
  scopes: z.array(ApiKeyScopeSchema),
  lastUsedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

export const ApiKeyCreateSchema = z.object({
  name: z.string().max(64),
  scopes: z.array(ApiKeyScopeSchema),
});
export type ApiKeyCreate = z.infer<typeof ApiKeyCreateSchema>;

export const ApiKeyWithSecretSchema = ApiKeySchema.extend({
  key: z.string(),
});
export type ApiKeyWithSecret = z.infer<typeof ApiKeyWithSecretSchema>;
