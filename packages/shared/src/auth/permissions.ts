import { type ApiKeyScope, ApiKeyScopeSchema } from "./api-key";
import { type UserRole, UserRoleSchema } from "./user";

export { type ApiKeyScope, ApiKeyScopeSchema, type UserRole, UserRoleSchema };

export const USER_ROLES = ["admin", "user"] as const;
export const API_KEY_SCOPES = [
  "read",
  "control",
  "files",
  "databases",
  "backups",
  "allocations",
  "settings",
  "users",
] as const;
