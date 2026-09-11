import { z } from "zod";

// The 8 permission bits for per-server member access
export const PERMISSIONS = [
  "console",
  "files",
  "backups",
  "power",
  "settings",
  "members",
  "allocations",
  "databases",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Schema for the full permission set (all 8 bits)
export const PermissionsSchema = z.object({
  console: z.boolean(),
  files: z.boolean(),
  backups: z.boolean(),
  power: z.boolean(),
  settings: z.boolean(),
  members: z.boolean(),
  allocations: z.boolean(),
  databases: z.boolean(),
});
export type Permissions = z.infer<typeof PermissionsSchema>;

// All permissions enabled (used for owner role)
export const ALL_PERMISSIONS: Permissions = {
  console: true,
  files: true,
  backups: true,
  power: true,
  settings: true,
  members: true,
  allocations: true,
  databases: true,
};

// No permissions (default for new members)
export const NO_PERMISSIONS: Permissions = {
  console: false,
  files: false,
  backups: false,
  power: false,
  settings: false,
  members: false,
  allocations: false,
  databases: false,
};
